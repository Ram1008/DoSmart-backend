import db from '../db.js';
import { body, validationResult } from 'express-validator';

// Utility: Check if valid ISO timestamp
function isValidDate(dateString) {
  return !isNaN(Date.parse(dateString));
}

// 1) CREATE Task
export const createTask = [
  // Validation
  body('type')
    .notEmpty()
    .isIn(['simple', 'custom'])
    .withMessage('Type must be either "simple" or "custom"'),

  // For 'simple' type, validate `textInput`
  body('textInput')
    .if(body('type').equals('simple'))
    .notEmpty()
    .withMessage('textInput is required for simple type'),

  // For 'custom' type, validate title, deadline; start_time optional
  body('title')
    .if(body('type').equals('custom'))
    .notEmpty()
    .withMessage('Title is required for custom type'),
  body('deadline')
    .if(body('type').equals('custom'))
    .custom(isValidDate)
    .withMessage('Valid deadline required (ISO format)'),

  // Optional start_time for 'custom'
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
        console.log('Generated task from text:', generated);
        title = generated.title;
        description = generated.description;
        start_time = generated.start_time || null;
        deadline = generated.deadline;
        // If generateTaskFromText did not provide a start_time, mark as Ongoing
        status = start_time ? 'Upcoming Task' : 'Ongoing Task';
      } else {
        // 2) CUSTOM flow: take fields directly from req.body
        ({ title, description = null, start_time = null, deadline } = req.body);

        // If no start_time provided, mark as Ongoing; else Upcoming
        status = start_time ? 'Upcoming Task' : 'Ongoing Task';
      }

      // Insert into DB
      const result = await db.query(
        `INSERT INTO tasks (user_id, title, description, start_time, deadline, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, title, description, start_time, deadline, status, created_at, updated_at`,
        [
          userId,
          title,
          description,
          start_time,
          deadline,
          status
        ]
      );

      res.status(201).json({ task: result.rows[0] });
    } catch (err) {
      next(err);
    }
  },
];

/**
 * Placeholder async function for processing `textInput` in the "simple" flow.
 * Replace its body with your actual implementation.
 * Should return at least: { title, description, start_time?, deadline }.
 */
async function generateTaskFromText(text) {
  // Example stub: use `text` as title, no description, no start_time, set deadline 24hrs later
  const now = new Date();
  return {
    title: text,
    description: null,
    start_time: null,
    deadline: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}


// 2) GET ALL Tasks (optionally filter by status)
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

// 3) GET SINGLE Task by ID
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

// 4) UPDATE Task (title, desc, start_time, deadline)
export const updateTask = [
  // Validation
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
      // पहले चेक करें कि यह task उसी user की है
      const existing = await db.query(
        `SELECT * FROM tasks WHERE id = $1 AND user_id = $2`,
        [taskId, userId]
      );
      if (existing.rows.length === 0)
        return res.status(404).json({ error: 'Task not found' });

      // Dynamically UPDATE only provided fields
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
      // always update updated_at
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

// 5) DELETE Task
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

// 6) PATCH Task Status (Manually Mark Complete/Incomplete)
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
