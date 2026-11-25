const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SORT_MAP = {
  newest: 'created_at DESC, id DESC',
  oldest: 'created_at ASC, id ASC',
  date_desc: 'incident_date DESC, id DESC',
  date_asc: 'incident_date ASC, id ASC',
  title_asc: 'LOWER(title) ASC, id DESC',
  title_desc: 'LOWER(title) DESC, id DESC',
  type_asc: 'report_type ASC, id DESC',
  status_asc: 'status ASC, id DESC'
};

// READ: GET /api/items?type=lost&status=open&search=keys&sort=date_desc
app.get('/api/items', (req, res) => {
  const { type, status, search, sort } = req.query;
  const conditions = [];
  const params = [];

  if (type && ['lost', 'found'].includes(type)) {
    conditions.push('report_type = ?');
    params.push(type);
  }

  if (status && ['open', 'claimed', 'returned'].includes(status)) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (search && search.trim() !== '') {
    const term = `%${search.trim()}%`;
    conditions.push('(title LIKE ? OR description LIKE ? OR location_name LIKE ? OR category LIKE ? OR reporter_name LIKE ?)');
    params.push(term, term, term, term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderByClause = SORT_MAP[sort] || SORT_MAP.newest;
  const sql = `SELECT * FROM items ${whereClause} ORDER BY ${orderByClause}`;

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database query failed', details: err.message });
    }
    res.json(rows);
  });
});

// READ SINGLE: GET /api/items/:id
app.get('/api/items/:id', (req, res) => {
  db.get('SELECT * FROM items WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'Item not found' });
    res.json(row);
  });
});

// CREATE: POST /api/items
app.post('/api/items', (req, res) => {
  const {
    report_type,
    title,
    category,
    description,
    location_name,
    incident_date,
    reporter_name,
    contact_info
  } = req.body;

  if (!['lost', 'found'].includes(report_type)) {
    return res.status(400).json({ error: "report_type must be 'lost' or 'found'" });
  }

  if (!title || !description || !location_name || !incident_date || !reporter_name || !contact_info) {
    return res.status(400).json({ error: 'Please complete all required fields' });
  }

  const sql = `
    INSERT INTO items (
      report_type, title, category, description,
      location_name, incident_date, reporter_name, contact_info
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    report_type,
    title.trim(),
    (category || 'General').trim(),
    description.trim(),
    location_name.trim(),
    incident_date.trim(),
    reporter_name.trim(),
    contact_info.trim()
  ];

  db.run(sql, params, function (err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to create record', details: err.message });
    }

    db.get('SELECT * FROM items WHERE id = ?', [this.lastID], (fetchErr, created) => {
      if (fetchErr) return res.status(500).json({ error: 'Created, but failed to fetch record' });
      res.status(201).json(created);
    });
  });
});

// UPDATE (Full Edit): PUT /api/items/:id
app.put('/api/items/:id', (req, res) => {
  const { id } = req.params;
  const {
    report_type,
    title,
    category,
    description,
    location_name,
    incident_date,
    reporter_name,
    contact_info,
    status
  } = req.body;

  if (!['lost', 'found'].includes(report_type)) {
    return res.status(400).json({ error: "report_type must be 'lost' or 'found'" });
  }
  if (!['open', 'claimed', 'returned'].includes(status)) {
    return res.status(400).json({ error: "status must be 'open', 'claimed', or 'returned'" });
  }
  if (!title || !description || !location_name || !incident_date || !reporter_name || !contact_info) {
    return res.status(400).json({ error: 'Please complete all required fields' });
  }

  const sql = `
    UPDATE items
    SET report_type = ?,
        title = ?,
        category = ?,
        description = ?,
        location_name = ?,
        incident_date = ?,
        reporter_name = ?,
        contact_info = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  const params = [
    report_type,
    title.trim(),
    (category || 'General').trim(),
    description.trim(),
    location_name.trim(),
    incident_date.trim(),
    reporter_name.trim(),
    contact_info.trim(),
    status,
    id
  ];

  db.run(sql, params, function (err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to update record', details: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    db.get('SELECT * FROM items WHERE id = ?', [id], (fetchErr, updated) => {
      if (fetchErr) return res.status(500).json({ error: 'Updated, but failed to fetch record' });
      res.json(updated);
    });
  });
});

// UPDATE (Quick Status Toggle): PATCH /api/items/:id/status
app.patch('/api/items/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['open', 'claimed', 'returned'].includes(status)) {
    return res.status(400).json({ error: "Status must be 'open', 'claimed', or 'returned'" });
  }

  db.run(
    'UPDATE items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to update status' });
      if (this.changes === 0) return res.status(404).json({ error: 'Item not found' });
      db.get('SELECT * FROM items WHERE id = ?', [id], (fetchErr, row) => {
        if (fetchErr) return res.status(500).json({ error: 'Failed to fetch record' });
        res.json(row);
      });
    }
  );
});

// DELETE: DELETE /api/items/:id
app.delete('/api/items/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM items WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to delete item' });
    if (this.changes === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Item deleted', id: Number(id) });
  });
});

app.listen(PORT, () => {
  console.log(`Lost & Found CRUD + Sorting server running on http://localhost:${PORT}`);
});