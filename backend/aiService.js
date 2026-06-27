const { generateWithGemini } = require('./providers/gemini');
const { generateWithOpenAI } = require('./providers/openai');

const providers = {
  gemini: generateWithGemini,
  openai: generateWithOpenAI,
};

function buildSystemPrompt(schemaJson) {
  let dialectRules = '';

  if (schemaJson.db_type === 'mysql') {
    dialectRules = `
- Target: MySQL 8.0+.
- Window functions (RANK, DENSE_RANK, ROW_NUMBER, LEAD, LAG, PERCENT_RANK, etc.) are fully supported.
- Recursive CTEs (WITH RECURSIVE) are supported.
- Use LIMIT / OFFSET for pagination.
- Do NOT use PostgreSQL/Oracle-specific functions (e.g., ILIKE, FETCH FIRST, ROWNUM).
- Do NOT use window functions directly in WHERE or HAVING – always wrap them in a subquery or CTE.
- Use standard MySQL date functions (e.g., DATE_SUB, DATE_ADD, NOW()).
`;
  } else if (schemaJson.db_type === 'postgresql') {
    dialectRules = `
- Target: PostgreSQL 15+.
- All window functions, recursive CTEs, and LATERAL joins are fully supported.
- Use LIMIT / OFFSET for pagination (the standard PostgreSQL style).
- Use ILIKE for case‑insensitive comparison.
- Do NOT use window functions directly in WHERE or HAVING – always wrap them in a subquery or CTE.
- Use standard PostgreSQL date functions (e.g., CURRENT_DATE, INTERVAL).
`;
  } else if (schemaJson.db_type === 'oracle') {
    dialectRules = `
- Target: Oracle Database 19c+.
- Use standard Oracle SQL: ROWNUM for simple row limiting, but FETCH FIRST is preferred (Oracle 12c+).
- For hierarchical queries, **prefer CONNECT BY**. Oracle also supports recursive subquery factoring using the WITH clause (without the RECURSIVE keyword).
- Window functions are fully supported.
- Do NOT use window functions directly in WHERE or HAVING – always wrap them in a subquery or CTE.
- Use DUAL for dummy selects when required.
- Use standard Oracle date functions (e.g., SYSDATE, ADD_MONTHS).
`;
  }

  const tablesForPrompt = schemaJson.tables.map(t => ({
    name: t.name,
    estimated_rows: t.estimated_rows,
    columns: t.columns.map(c => ({
      name: c.name,
      type: c.type,
      fk: c.fk || null,
      constraints: c.constraints || null
    }))
  }));

  return `You are a SQL expert. Target database: ${schemaJson.db_type}.
${dialectRules}

Schema (tables, columns, types, constraints, foreign keys, estimated row counts):
${JSON.stringify(tablesForPrompt, null, 2)}

Convert the user request into 1-3 valid SQL queries (array).  
The first query MUST be the most optimal, efficient, and safe version.  
The subsequent queries (if any) can be alternative approaches or less optimized versions.

For each query, provide **only** the following fields (no additional fields):
- sql: exact SQL statement
- explanation: plain-English explanation of what the query does
- tables: list of table names involved
- attributes: list of column names used
- warnings: array of strings if the query is risky (e.g., UPDATE without WHERE, possible division by zero, etc.)
- optimizations: array of suggested improvements (e.g., add an index, use EXISTS instead of a subquery)

**CRITICAL RULES**
1. Window functions (RANK, ROW_NUMBER, PERCENT_RANK, LEAD, LAG, etc.) MUST NEVER appear directly in a WHERE or HAVING clause.  
   Always compute them in a subquery or CTE and filter in the outer query.
2. If a user asks for "top N per group", "rank", "percentile", "median", "running total", etc., use appropriate window functions, but respect rule #1.
3. Use explicit JOINs (INNER JOIN, LEFT JOIN, etc.) instead of old-style comma joins.
4. Always handle NULLs correctly (use COALESCE, IS NULL, or safe defaults).
5. For recursive/hierarchical queries:
   - PostgreSQL/MySQL: use WITH RECURSIVE.
   - Oracle: prefer CONNECT BY; if using recursive subquery factoring, use Oracle's WITH syntax (WITH, not WITH RECURSIVE).
6. **Join rules**: Prefer joins that follow the schema's foreign keys when applicable. If another join condition is required to satisfy the user's request, ensure it is logically correct.
7. **Efficiency**:  
   - Prefer EXISTS over IN for correlated existence checks on large datasets; use IN when it is simpler and equally appropriate.  
   - Avoid unnecessary SELECT *, unnecessary DISTINCT, repeated correlated subqueries, and Cartesian products.  
   - Use CTEs for readability when queries become complex.  
   - Use only the tables required to answer the question - do not add unnecessary joins.
8. Whenever LIMIT, FETCH FIRST, or ROWNUM is used, **always include an ORDER BY clause** unless the user explicitly requests arbitrary rows.
9. If the user's request has multiple valid interpretations (e.g., "highest salary" could mean single employee or per department), return multiple query options. Option 1 should be the most likely interpretation.
10. **Index suggestions**: Recommend indexes only if they are likely to improve performance. Do NOT recommend indexes on primary keys or columns already implicitly indexed. Explain why the recommendation helps.
11. **SELF-VALIDATION PASS** - Before returning the JSON, review every query:
    - Every table exists in the schema.
    - Every column exists in its table.
    - JOIN conditions are correct and, where possible, use declared foreign keys.
    - The SQL is syntactically valid for the target dialect (no mixed-dialect syntax).
    - GROUP BY clauses include all non-aggregated SELECT columns (except when using functional dependencies in the dialect).
    - Window functions are used only in SELECT / ORDER BY (not WHERE) and their frames are valid.
    - Recursive queries respect the dialect's syntax.
    - Rewrite any invalid query before returning it.

Return ONLY a JSON object with key "queries" containing an array of these objects. Do NOT include any other text.`;
}

function parseAndValidate(text, schemaJson) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON from AI');
  }
  if (!Array.isArray(parsed.queries)) {
    throw new Error('Missing queries array');
  }

  if (schemaJson) {
    const tableNames = new Set(schemaJson.tables.map(t => t.name));
    parsed.queries = parsed.queries.map(q => {
      const warnings = q.warnings || [];

      // Block extreme DDL
      const dangerous = /\b(DROP|ALTER|TRUNCATE|CREATE)\b/i;
      let sql = dangerous.test(q.sql) ? q.sql + ' -- blocked' : q.sql;

      // Warn about risky DELETE/UPDATE without WHERE
      const sqlUpper = sql.toUpperCase();
      if ((sqlUpper.includes('DELETE') && !sqlUpper.includes('WHERE')) ||
          (sqlUpper.includes('UPDATE') && !sqlUpper.includes('WHERE'))) {
        warnings.push('This statement may affect ALL rows – ensure that is intended.');
      }

      // Check for balanced parentheses (simple heuristic)
      if ((sql.match(/\(/g) || []).length !== (sql.match(/\)/g) || []).length) {
        warnings.push('SQL contains unbalanced parentheses – review the query.');
      }

      return {
        ...q,
        sql,
        warnings
      };
    });
  }

  return parsed.queries;
}

async function generateQueries(schemaJson, userPrompt) {
  const provider = process.env.AI_PROVIDER || 'gemini';
  const handler = providers[provider];
  if (!handler) throw new Error(`Unsupported AI provider: ${provider}`);
  const systemPrompt = buildSystemPrompt(schemaJson);
  const raw = await handler(systemPrompt, userPrompt);
  return parseAndValidate(raw, schemaJson);
}

module.exports = { generateQueries };