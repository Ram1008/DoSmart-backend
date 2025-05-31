import db from '../db.js';
import { body, validationResult } from 'express-validator';

function isValidDate(dateString) {
  return !isNaN(Date.parse(dateString));
}

export const createTask = [
  body('type')
    .notEmpty()
    .isIn(['simple', 'custom'])
    .withMessage('Type must be either "simple" or "custom"'),

  body('textInput')
    .if(body('type').equals('simple'))
    .notEmpty()
    .withMessage('textInput is required for simple type'),

  body('title')
    .if(body('type').equals('custom'))
    .notEmpty()
    .withMessage('Title is required for custom type'),
  body('deadline')
    .if(body('type').equals('custom'))
    .custom(isValidDate)
    .withMessage('Valid deadline required (ISO format)'),

  body('start_time')
    .optional()
    .custom(isValidDate)
    .withMessage('Valid start_time required (ISO format)'),

  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const userId = req.user.id;
    try {
      let title, description, start_time, deadline, status;

      if (req.body.type === 'simple') {
        const { textInput } = req.body;
        const generated = await generateTaskFromText(textInput);
        title = generated.title;
        description = generated.description;
        start_time = generated.start_time || null;
        deadline = generated.deadline;
        status = start_time ? 'Upcoming Task' : 'Ongoing Task';
      } else {
        ({ title, description = null, start_time = null, deadline } = req.body);
        status = start_time ? 'Upcoming Task' : 'Ongoing Task';
      }

      const result = await db.query(
        `INSERT INTO tasks (user_id, title, description, start_time, deadline, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, title, description, start_time, deadline, status, created_at, updated_at`,
        [userId, title, description, start_time, deadline, status]
      );

      res.status(201).json({ task: result.rows[0] });
    } catch (err) {
      next(err);
    }
  },
];

async function generateTaskFromText(text) {
  const now = new Date();
  return {
    title: text,
    description: null,
    start_time: null,
    deadline: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export const getAllTasks = async (req, res, next) => {
  const userId = req.user.id;
  const { status } = req.query;

  try {
    let queryText = `SELECT * FROM tasks WHERE user_id = $1`;
    const params = [userId];

    if (status) {
      queryText += ` AND status = $2`;
      params.push(status);
    }

    queryText += ` ORDER BY deadline ASC`;

    const result = await db.query(queryText, params);
    res.json({ tasks: result.rows });
  } catch (err) {
    next(err);
  }
};

export const getTaskById = async (req, res, next) => {
  const userId = req.user.id;
  const taskId = req.params.id;

  try {
    const result = await db.query(
      `SELECT * FROM tasks WHERE id = $1 AND user_id = $2`,
      [taskId, userId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Task not found' });

    res.json({ task: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

export const updateTask = [
  body('title').optional().notEmpty().withMessage('Title cannot be empty'),
  body('start_time')
    .optional()
    .custom(isValidDate)
    .withMessage('Valid start_time required (ISO format)'),
  body('deadline')
    .optional()
    .custom(isValidDate)
    .withMessage('Valid deadline required (ISO format)'),
  body('status')
    .optional()
    .isIn(['Upcoming Task', 'Ongoing Task', 'Failed Task', 'Successful Task'])
    .withMessage('Invalid status value'),

  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const userId = req.user.id;
    const taskId = req.params.id;
    const { title, description, start_time, deadline, status } = req.body;

    try {
      const existing = await db.query(
        `SELECT * FROM tasks WHERE id = $1 AND user_id = $2`,
        [taskId, userId]
      );
      if (existing.rows.length === 0)
        return res.status(404).json({ error: 'Task not found' });

      const fields = [];
      const params = [];
      let idx = 1;

      if (title !== undefined) {
        fields.push(`title = $${idx++}`);
        params.push(title);
      }
      if (description !== undefined) {
        fields.push(`description = $${idx++}`);
        params.push(description);
      }
      if (start_time !== undefined) {
        fields.push(`start_time = $${idx++}`);
        params.push(start_time);
      }
      if (deadline !== undefined) {
        fields.push(`deadline = $${idx++}`);
        params.push(deadline);
      }
      if (status !== undefined) {
        fields.push(`status = $${idx++}`);
        params.push(status);
      }
      fields.push(`updated_at = NOW()`);

      const setClause = fields.join(', ');
      params.push(taskId, userId);

      const queryText = `
        UPDATE tasks
        SET ${setClause}
        WHERE id = $${idx++} AND user_id = $${idx}
        RETURNING *;
      `;

      const result = await db.query(queryText, params);
      res.json({ task: result.rows[0] });
    } catch (err) {
      next(err);
    }
  },
];

export const deleteTask = async (req, res, next) => {
  const userId = req.user.id;
  const taskId = req.params.id;

  try {
    const result = await db.query(
      `DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING *`,
      [taskId, userId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Task not found or already deleted' });

    res.json({ message: 'Task deleted' });
  } catch (err) {
    next(err);
  }
};

export const updateTaskStatus = [
  body('status')
    .notEmpty()
    .isIn(['Upcoming Task', 'Ongoing Task', 'Failed Task', 'Successful Task'])
    .withMessage('Invalid status value'),

  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const userId = req.user.id;
    const taskId = req.params.id;
    const { status } = req.body;

    try {
      const result = await db.query(
        `UPDATE tasks
         SET status = $1, updated_at = NOW()
         WHERE id = $2 AND user_id = $3
         RETURNING *`,
        [status, taskId, userId]
      );
      if (result.rows.length === 0)
        return res.status(404).json({ error: 'Task not found' });

      res.json({ task: result.rows[0] });
    } catch (err) {
      next(err);
    }
  },
];
