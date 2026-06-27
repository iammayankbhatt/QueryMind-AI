const express = require('express');
const router = express.Router({ mergeParams: true });
const { supabaseAdmin } = require('../db');
const { authenticate } = require('../middleware/auth');
const { userRateLimiter } = require('../middleware/rateLimiter');
const { generateQueries } = require('../aiService');
const { executeOnVirtual, executeOnVirtualWithData, generateDummyData } = require('../utils/virtualDB');

router.use(authenticate);

// Generate SQL from natural language
router.post('/generate', userRateLimiter, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { prompt } = req.body;

    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('schema_json')
      .eq('id', projectId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !project) return res.status(404).json({ error: 'Project not found' });

    const queries = await generateQueries(project.schema_json, prompt);

    // Save to history
    await supabaseAdmin.from('query_history').insert({
      user_id: req.user.id,
      project_id: projectId,
      prompt,
      generated_queries: queries,
    });

    res.json({ queries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});






// Execute selected query on virtual database
router.post('/execute', userRateLimiter, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { sql } = req.body;

    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('schema_json, dummy_data')
      .eq('id', projectId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !project) return res.status(404).json({ error: 'Project not found' });

    // Use stored dummy_data, or generate new if empty
    let dummyData = project.dummy_data;
    if (!dummyData || Object.keys(dummyData).length === 0) {
      dummyData = generateDummyData(project.schema_json);
    }

    const result = await executeOnVirtualWithData(project.schema_json, dummyData, sql);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});







// Get query history for a project
router.get('/history', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('query_history')
    .select('id, prompt, generated_queries, created_at')
    .eq('project_id', req.params.id)
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;