function validateSchema(schema) {
  if (!schema.db_type || !['mysql', 'postgresql','oracle'].includes(schema.db_type)) {
    throw new Error('Invalid db_type');
  }
  if (!Array.isArray(schema.tables) || schema.tables.length === 0) {
    throw new Error('At least one table required');
  }
  schema.tables.forEach(table => {
    if (!table.name || !Array.isArray(table.columns)) {
      throw new Error('Invalid table structure');
    }
    table.columns.forEach(col => {
      if (!col.name || !col.type) {
        throw new Error('Column must have name and type');
      }
    });
  });
  return true;
}

module.exports = { validateSchema };