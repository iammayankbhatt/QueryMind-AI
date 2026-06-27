require('dotenv').config();
const express = require('express');
const cors = require('cors');
const projectsRouter = require('./routes/projects');
const queriesRouter = require('./routes/queries');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/projects', projectsRouter);
app.use('/api/projects/:id', queriesRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});