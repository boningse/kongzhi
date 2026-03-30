import express, { Request, Response } from 'express';
import { query } from '../db.js';
import { verifyUserToken } from './auth.js';

const router = express.Router();

router.use(verifyUserToken);

// ================= Device Types =================

// Get all device types
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT dt.*, 
        (SELECT COUNT(*) FROM device_type_functions dtf WHERE dtf.device_type_id = dt.id) as function_count
      FROM device_types dt
      ORDER BY dt.created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching device types:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch device types' });
  }
});

// Create a new device type
router.post('/', async (req: Request, res: Response) => {
  const { name, code, description } = req.body;
  try {
    const existing = await query('SELECT id FROM device_types WHERE code = $1', [code]);
    if (existing.rowCount && existing.rowCount > 0) {
      return res.status(400).json({ success: false, error: '设备类型编码已存在' });
    }

    const result = await query(
      `INSERT INTO device_types (name, code, description) VALUES ($1, $2, $3) RETURNING *`,
      [name, code, description]
    );
    res.json({ success: true, message: 'Device type created', data: result.rows[0] });
  } catch (error) {
    console.error('Error creating device type:', error);
    res.status(500).json({ success: false, error: 'Failed to create device type' });
  }
});

// Update a device type
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, code, description } = req.body;
  try {
    const existing = await query('SELECT id FROM device_types WHERE code = $1 AND id != $2', [code, parseInt(id, 10)]);
    if (existing.rowCount && existing.rowCount > 0) {
      return res.status(400).json({ success: false, error: '设备类型编码已存在' });
    }

    const result = await query(
      `UPDATE device_types SET name = $1, code = $2, description = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *`,
      [name, code, description, parseInt(id, 10)]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Device type not found' });
    }
    res.json({ success: true, message: 'Device type updated', data: result.rows[0] });
  } catch (error) {
    console.error('Error updating device type:', error);
    res.status(500).json({ success: false, error: 'Failed to update device type' });
  }
});

// Delete a device type
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM device_types WHERE id = $1', [parseInt(id, 10)]);
    res.json({ success: true, message: 'Device type deleted' });
  } catch (error) {
    console.error('Error deleting device type:', error);
    res.status(500).json({ success: false, error: 'Failed to delete device type' });
  }
});


// ================= Device Type Functions =================

// Get all functions for a specific device type
router.get('/:typeId/functions', async (req: Request, res: Response) => {
  const { typeId } = req.params;
  try {
    const result = await query(
      `SELECT * FROM device_type_functions WHERE device_type_id = $1 ORDER BY created_at ASC`,
      [parseInt(typeId, 10)]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching functions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch functions' });
  }
});

// Create a new function for a device type
router.post('/:typeId/functions', async (req: Request, res: Response) => {
  const { typeId } = req.params;
  const { function_code, function_name, data_type, unit, description } = req.body;
  try {
    const existing = await query(
      'SELECT id FROM device_type_functions WHERE device_type_id = $1 AND function_code = $2', 
      [parseInt(typeId, 10), function_code]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return res.status(400).json({ success: false, error: '该设备类型下功能码已存在' });
    }

    const result = await query(
      `INSERT INTO device_type_functions 
        (device_type_id, function_code, function_name, data_type, unit, description) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [parseInt(typeId, 10), function_code, function_name, data_type, unit, description]
    );
    res.json({ success: true, message: 'Function created', data: result.rows[0] });
  } catch (error) {
    console.error('Error creating function:', error);
    res.status(500).json({ success: false, error: 'Failed to create function' });
  }
});

// Update a function
router.put('/:typeId/functions/:funcId', async (req: Request, res: Response) => {
  const { typeId, funcId } = req.params;
  const { function_code, function_name, data_type, unit, description } = req.body;
  try {
    const existing = await query(
      'SELECT id FROM device_type_functions WHERE device_type_id = $1 AND function_code = $2 AND id != $3', 
      [parseInt(typeId, 10), function_code, parseInt(funcId, 10)]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return res.status(400).json({ success: false, error: '该设备类型下功能码已存在' });
    }

    const result = await query(
      `UPDATE device_type_functions 
       SET function_code = $1, function_name = $2, data_type = $3, unit = $4, description = $5, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $6 RETURNING *`,
      [function_code, function_name, data_type, unit, description, parseInt(funcId, 10)]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Function not found' });
    }
    res.json({ success: true, message: 'Function updated', data: result.rows[0] });
  } catch (error) {
    console.error('Error updating function:', error);
    res.status(500).json({ success: false, error: 'Failed to update function' });
  }
});

// Delete a function
router.delete('/:typeId/functions/:funcId', async (req: Request, res: Response) => {
  const { funcId } = req.params;
  try {
    await query('DELETE FROM device_type_functions WHERE id = $1', [parseInt(funcId, 10)]);
    res.json({ success: true, message: 'Function deleted' });
  } catch (error) {
    console.error('Error deleting function:', error);
    res.status(500).json({ success: false, error: 'Failed to delete function' });
  }
});

export default router;
