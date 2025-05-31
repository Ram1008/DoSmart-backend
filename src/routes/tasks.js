import express from 'express';
import * as taskController from '../controllers/taskController.js';

const router = express.Router();

// POST   /api/tasks          → create new task
router.post('/', taskController.createTask);

// GET    /api/tasks          → get all tasks (optionally filter by ?status=)
router.get('/', taskController.getAllTasks);

// GET    /api/tasks/:id      → get single task
router.get('/:id', taskController.getTaskById);

// PUT    /api/tasks/:id      → update task fields
router.put('/:id', taskController.updateTask);

// PATCH  /api/tasks/:id/status → update only status
router.patch('/:id/status', taskController.updateTaskStatus);

// DELETE /api/tasks/:id      → delete task
router.delete('/:id', taskController.deleteTask);

export default router;
