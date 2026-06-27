const initSqlJs = require('sql.js');

function seededRandom(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash) / 2147483647;
}

function generateDummyValue(colName, colType, seed) {
  const rnd = seededRandom(seed + colName);
  const typeUpper = colType.toUpperCase();
  if (typeUpper.includes('INT')) return Math.floor(rnd * 10000);
  if (typeUpper.includes('DECIMAL') || typeUpper.includes('NUMERIC') || typeUpper.includes('FLOAT'))
    return parseFloat((rnd * 10000).toFixed(2));
  if (typeUpper.includes('VARCHAR') || typeUpper.includes('TEXT') || typeUpper.includes('CHAR'))
    return `val_${colName}_${Math.floor(rnd * 1000)}`;
  if (typeUpper.includes('BOOLEAN')) return rnd > 0.5 ? 1 : 0;
  if (typeUpper.includes('DATE'))
    return `2024-${String(Math.floor(rnd * 12) + 1).padStart(2, '0')}-${String(Math.floor(rnd * 28) + 1).padStart(2, '0')}`;
  return 'dummy';
}

function generateDummyData(schemaJson) {
  const data = {};
  schemaJson.tables.forEach(table => {
    const rows = [];
    const count = table.estimated_rows || 10;
    for (let i = 0; i < count; i++) {
      const seedBase = `${table.name}_${i}`;
      const row = {};
      table.columns.forEach(col => {
        if (col.fk) {
          const [refTable] = col.fk.split('.');
          row[col.name] = Math.floor(seededRandom(`${seedBase}_fk_${refTable}`) * 100) + 1;
        } else {
          row[col.name] = generateDummyValue(col.name, col.type, seedBase);
        }
      });
      rows.push(row);
    }
    data[table.name] = rows;
  });
  return data;
}

function buildColumnDefinition(col) {
  let def = `${col.name} ${col.type}`;
  if (col.constraints && col.constraints.trim()) {
    def += ` ${col.constraints.trim()}`;
  }
  if (col.fk) {
    const [refTable, refCol] = col.fk.split('.');
    def += ` REFERENCES ${refTable}(${refCol})`;
  }
  return def;
}

async function createVirtualDBFromData(schemaJson, dummyData) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  schemaJson.tables.forEach(table => {
    const colDefs = table.columns.map(buildColumnDefinition).join(', ');
    const createSQL = `CREATE TABLE ${table.name} (${colDefs});`;
    console.log(createSQL);  // <-- debug line
    db.run(createSQL);

    const rows = dummyData[table.name] || [];
    rows.forEach(row => {
      const values = table.columns.map(col => {
        const val = row[col.name];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'string') return `'${val}'`;
        return val;
      }).join(', ');
      db.run(`INSERT INTO ${table.name} VALUES (${values});`);
    });
  });

  return db;
}

// legacy (not used if dummy_data is present)
async function createVirtualDB(schemaJson, projectId) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  schemaJson.tables.forEach(table => {
    const colDefs = table.columns.map(buildColumnDefinition).join(', ');
    db.run(`CREATE TABLE ${table.name} (${colDefs});`);

    const rows = table.estimated_rows || 10;
    for (let i = 0; i < rows; i++) {
      const seedBase = `${projectId}_${table.name}_${i}`;
      const values = table.columns.map(col => {
        let val;
        if (col.fk) {
          const [refTable] = col.fk.split('.');
          val = Math.floor(seededRandom(`${seedBase}_fk_${refTable}`) * 100) + 1;
        } else {
          val = generateDummyValue(col.name, col.type, seedBase);
        }
        return typeof val === 'string' ? `'${val}'` : val;
      }).join(', ');
      db.run(`INSERT INTO ${table.name} VALUES (${values});`);
    }
  });

  return db;
}

async function executeOnVirtualWithData(schemaJson, dummyData, sql) {
  const db = await createVirtualDBFromData(schemaJson, dummyData);
  try {
    const results = db.exec(sql);
    const rows = results.length > 0 ? results[0].values : [];
    const columns = results.length > 0 ? results[0].columns : [];
    return { columns, rows };
  } finally {
    db.close();
  }
}

async function executeOnVirtual(schemaJson, projectId, sql) {
  const db = await createVirtualDB(schemaJson, projectId);
  try {
    const results = db.exec(sql);
    const rows = results.length > 0 ? results[0].values : [];
    const columns = results.length > 0 ? results[0].columns : [];
    return { columns, rows };
  } finally {
    db.close();
  }
}

module.exports = {
  executeOnVirtual,
  executeOnVirtualWithData,
  generateDummyData,
  generateDummyValue,
  createVirtualDBFromData
};