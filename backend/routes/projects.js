const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../db');
const { validateSchema } = require('../utils/schemaHelpers');
const { authenticate } = require('../middleware/auth');
const { userRateLimiter } = require('../middleware/rateLimiter');
const { generateDummyData } = require('../utils/virtualDB');

router.use(authenticate);




// Create project (also generates initial dummy data)
router.post('/', userRateLimiter, async (req, res) => {
  try {
    const { name, db_type, schema_json, dummy_mode } = req.body;
    validateSchema(schema_json);

    let dummyData = {};
    if (dummy_mode === 'empty') {
      dummyData = {};
    } else {
      // default 'auto' or any other value
      dummyData = generateDummyData(schema_json);
    }

    const { data, error } = await supabaseAdmin
      .from('projects')
      .insert({
        user_id: req.user.id,
        name,
        db_type,
        schema_json,
        dummy_data: dummyData
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});





// List user's projects
router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, name, db_type, schema_json, dummy_data, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Get single project
router.get('/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (error || !data) return res.status(404).json({ error: 'Project not found' });
  res.json(data);
});

// Update project (schema & dummy data)
router.put('/:id', userRateLimiter, async (req, res) => {
  try {
    const { name, db_type, schema_json, dummy_data } = req.body;
    if (schema_json) validateSchema(schema_json);
    const updates = {};
    if (name) updates.name = name;
    if (db_type) updates.db_type = db_type;
    if (schema_json) updates.schema_json = schema_json;
    if (dummy_data) updates.dummy_data = dummy_data;
    const { data, error } = await supabaseAdmin
      .from('projects')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  const { error } = await supabaseAdmin
    .from('projects')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Get dummy data for a project
router.get('/:id/dummy', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('dummy_data')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (error || !data) return res.status(404).json({ error: 'Project not found' });
  res.json(data.dummy_data || {});
});

// Update dummy data (full replacement or partial)
router.put('/:id/dummy', userRateLimiter, async (req, res) => {
  const { dummy_data } = req.body; // entire dummy_data object
  const { error } = await supabaseAdmin
    .from('projects')
    .update({ dummy_data })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});


// Copy project
// Copy project
router.post('/:id/copy', userRateLimiter, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { mode, name: customName } = req.body;

    if (!['full', 'auto', 'schema'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid copy mode. Use full, auto, or schema.' });
    }

    const { data: original, error } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !original) return res.status(404).json({ error: 'Project not found' });

    let newDummyData = {};

    if (mode === 'full') {
      newDummyData = original.dummy_data || {};
    } else if (mode === 'auto') {
      const { generateDummyData } = require('../utils/virtualDB');
      newDummyData = generateDummyData(original.schema_json);
    } else if (mode === 'schema') {
      newDummyData = {};
    }

    // Use the custom name if provided, otherwise auto‑generate a unique one
    const newName = customName || `${original.name} (copy ${new Date().toLocaleString()})`;

    const { data: newProject, error: insertError } = await supabaseAdmin
      .from('projects')
      .insert({
        user_id: req.user.id,
        name: newName,
        db_type: original.db_type,
        schema_json: original.schema_json,
        dummy_data: newDummyData
      })
      .select()
      .single();

    if (insertError) throw insertError;
    res.status(201).json(newProject);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;