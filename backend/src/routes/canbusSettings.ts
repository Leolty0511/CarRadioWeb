import { Router, Request, Response } from 'express'
import { canbusSettingsService } from '../services/canbusSettingsService'
import { authenticateUser, requirePermission } from '../middleware/auth'
import { PERMISSIONS } from '../config/permissions'
import logger from '../utils/logger'
import { isKnowledgeSectionEnabled } from '../services/knowledgeSectionService'

const router = Router()

// ==================== 公开接口 ====================

/**
 * 获取所�?CANBox 类型（仅启用的）
 */
router.get('/canbox-types', async (_req: Request, res: Response) => {
  try {
    if (!(await isKnowledgeSectionEnabled('canbusSettingsEnabled'))) {
      return res.status(404).json({ success: false, error: 'module_disabled' })
    }
    const types = await canbusSettingsService.getAllCANBoxTypes(true)
    res.json({ success: true, data: types })
  } catch (error) {
    logger.error({ err: error }, 'GET /canbox-types error')
    res.status(500).json({ success: false, error: 'Failed to get CANBox types' })
  }
})

/**
 * 获取启用的产品主机型号
 */
router.get('/head-unit-types', async (_req: Request, res: Response) => {
  try {
    if (!(await isKnowledgeSectionEnabled('canbusSettingsEnabled'))) {
      return res.status(404).json({ success: false, error: 'module_disabled' })
    }
    const types = await canbusSettingsService.getAllHeadUnitTypes(true)
    res.json({ success: true, data: types })
  } catch (error) {
    logger.error({ err: error }, 'GET /head-unit-types error')
    res.status(500).json({ success: false, error: 'Failed to get head unit types' })
  }
})

/**
 * 获取设置信息（图�?描述�?
 */
router.get('/setting', async (req: Request, res: Response) => {
  try {
    if (!(await isKnowledgeSectionEnabled('canbusSettingsEnabled'))) {
      return res.status(404).json({ success: false, error: 'module_disabled' })
    }
    const { vehicleId, headUnitTypeId } = req.query;

    if (!vehicleId) {
      res.status(400).json({
        success: false,
        error: 'Missing required parameter: vehicleId'
      });
      return;
    }

    const setting = await canbusSettingsService.getSettingByVehicle(vehicleId as string, headUnitTypeId as string | undefined);

    if (!setting) {
      res.status(404).json({ success: false, error: 'Setting not found' });
      return;
    }

    res.json({ success: true, data: setting });
  } catch (error) {
    logger.error({ err: error }, 'GET /setting error');
    res.status(500).json({ success: false, error: 'Failed to get setting' });
  }
});

/**
 * 获取页面顶部说明文案
 */
router.get('/intro', async (_req: Request, res: Response) => {
  try {
    if (!(await isKnowledgeSectionEnabled('canbusSettingsEnabled'))) {
      return res.status(404).json({ success: false, error: 'module_disabled' })
    }
    const intro = await canbusSettingsService.getPageIntro()
    res.json({ success: true, data: intro })
  } catch (error) {
    logger.error({ err: error }, 'GET /intro error')
    res.status(500).json({ success: false, error: 'Failed to get intro' })
  }
})

// ==================== 管理接口（需要认证）====================

router.get('/admin/head-unit-types', authenticateUser, requirePermission(PERMISSIONS.canbus.read), async (_req: Request, res: Response) => {
  try {
    const types = await canbusSettingsService.getAllHeadUnitTypes(false)
    res.json({ success: true, data: types })
  } catch (error) {
    logger.error({ err: error }, 'GET /admin/head-unit-types error')
    res.status(500).json({ success: false, error: 'Failed to get head unit types' })
  }
})

router.post('/admin/head-unit-types', authenticateUser, requirePermission(PERMISSIONS.canbus.update), async (req: Request, res: Response) => {
  try {
    const type = await canbusSettingsService.createHeadUnitType(req.body)
    res.status(201).json({ success: true, data: type })
  } catch (error: unknown) {
    const mongoError = error as { code?: number }
    if (mongoError.code === 11000) {
      return res.status(400).json({ success: false, error: 'Head unit type name already exists' })
    }
    logger.error({ err: error }, 'POST /admin/head-unit-types error')
    res.status(500).json({ success: false, error: 'Failed to create head unit type' })
  }
})

router.put('/admin/head-unit-types/:id', authenticateUser, requirePermission(PERMISSIONS.canbus.update), async (req: Request, res: Response) => {
  try {
    const type = await canbusSettingsService.updateHeadUnitType(req.params.id, req.body)
    if (!type) return res.status(404).json({ success: false, error: 'Head unit type not found' })
    res.json({ success: true, data: type })
  } catch (error) {
    logger.error({ err: error }, 'PUT /admin/head-unit-types/:id error')
    res.status(500).json({ success: false, error: 'Failed to update head unit type' })
  }
})

router.delete('/admin/head-unit-types/:id', authenticateUser, requirePermission(PERMISSIONS.canbus.update), async (req: Request, res: Response) => {
  try {
    await canbusSettingsService.deleteHeadUnitType(req.params.id)
    res.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('Cannot delete')) return res.status(400).json({ success: false, error: message })
    logger.error({ err: error }, 'DELETE /admin/head-unit-types/:id error')
    res.status(500).json({ success: false, error: 'Failed to delete head unit type' })
  }
})

// --- CANBox 类型管理 ---

/**
 * 获取所�?CANBox 类型（包括禁用的�?
 */
router.get('/admin/canbox-types', authenticateUser, requirePermission(PERMISSIONS.canbus.read), async (_req: Request, res: Response) => {
  try {
    const types = await canbusSettingsService.getAllCANBoxTypes(false)
    res.json({ success: true, data: types })
  } catch (error) {
    logger.error({ err: error }, 'GET /admin/canbox-types error')
    res.status(500).json({ success: false, error: 'Failed to get CANBox types' })
  }
})

/**
 * 创建 CANBox 类型
 */
router.post('/admin/canbox-types', authenticateUser, requirePermission(PERMISSIONS.canbus.update), async (req: Request, res: Response) => {
  try {
    const canboxType = await canbusSettingsService.createCANBoxType(req.body);
    res.status(201).json({ success: true, data: canboxType });
  } catch (error: unknown) {
    logger.error({ err: error }, 'POST /admin/canbox-types error');
    const mongoError = error as { code?: number };
    if (mongoError.code === 11000) {
      res.status(400).json({ success: false, error: 'CANBox type name already exists' });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to create CANBox type' });
  }
});

/**
 * 更新 CANBox 类型
 */
router.put('/admin/canbox-types/:id', authenticateUser, requirePermission(PERMISSIONS.canbus.update), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const canboxType = await canbusSettingsService.updateCANBoxType(id, req.body);

    if (!canboxType) {
      res.status(404).json({ success: false, error: 'CANBox type not found' });
      return;
    }

    res.json({ success: true, data: canboxType });
  } catch (error) {
    logger.error({ err: error }, 'PUT /admin/canbox-types/:id error');
    res.status(500).json({ success: false, error: 'Failed to update CANBox type' });
  }
});

/**
 * 删除 CANBox 类型
 */
router.delete('/admin/canbox-types/:id', authenticateUser, requirePermission(PERMISSIONS.canbus.update), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await canbusSettingsService.deleteCANBoxType(id);
    res.json({ success: true, message: 'CANBox type deleted successfully' });
  } catch (error: unknown) {
    logger.error({ err: error }, 'DELETE /admin/canbox-types/:id error');
    const err = error as Error;
    if (err.message?.includes('Cannot delete')) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to delete CANBox type' });
  }
});

// --- CANBus 设置管理 ---

/**
 * 获取所有设�?
 */
router.get('/admin/settings', authenticateUser, requirePermission(PERMISSIONS.canbus.read), async (req: Request, res: Response) => {
  try {
    const { vehicleId, headUnitTypeId, isActive } = req.query
    const page = Number(req.query.page || 1)
    const pageSize = Number(req.query.pageSize || 20)
    const filters: Record<string, unknown> = {}
    
    if (vehicleId) filters.vehicleId = vehicleId
    if (headUnitTypeId) filters.headUnitTypeId = headUnitTypeId
    if (isActive !== undefined) filters.isActive = isActive === 'true'
    
    const settings = await canbusSettingsService.getAllSettings(filters as {
      vehicleId?: string
      headUnitTypeId?: string
      isActive?: boolean
    }, { page, pageSize })
    res.json({ success: true, data: settings })
  } catch (error) {
    logger.error({ err: error }, 'GET /admin/settings error')
    res.status(500).json({ success: false, error: 'Failed to get settings' })
  }
})

/**
 * 创建设置
 */
router.post('/admin/settings', authenticateUser, requirePermission(PERMISSIONS.canbus.update), async (req: Request, res: Response) => {
  try {
    const setting = await canbusSettingsService.createSetting(req.body);
    res.status(201).json({ success: true, data: setting });
  } catch (error: unknown) {
    logger.error({ err: error }, 'POST /admin/settings error');
    const mongoError = error as { code?: number };
    if (mongoError.code === 11000) {
      res.status(400).json({
        success: false,
        error: 'Setting already exists for this vehicle'
      });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to create setting' });
  }
});

/**
 * 更新设置
 */
router.put('/admin/settings/:id', authenticateUser, requirePermission(PERMISSIONS.canbus.update), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const setting = await canbusSettingsService.updateSetting(id, req.body);

    if (!setting) {
      res.status(404).json({ success: false, error: 'Setting not found' });
      return;
    }

    res.json({ success: true, data: setting });
  } catch (error) {
    logger.error({ err: error }, 'PUT /admin/settings/:id error');
    res.status(500).json({ success: false, error: 'Failed to update setting' });
  }
});

/**
 * 删除设置
 */
router.delete('/admin/settings/:id', authenticateUser, requirePermission(PERMISSIONS.canbus.update), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await canbusSettingsService.deleteSetting(id);

    if (!deleted) {
      res.status(404).json({ success: false, error: 'Setting not found' });
      return;
    }

    res.json({ success: true, message: 'Setting deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'DELETE /admin/settings/:id error');
    res.status(500).json({ success: false, error: 'Failed to delete setting' });
  }
});

router.get('/admin/intro', authenticateUser, requirePermission(PERMISSIONS.canbus.read), async (_req: Request, res: Response) => {
  try {
    const intro = await canbusSettingsService.getPageIntro()
    res.json({ success: true, data: intro })
  } catch (error) {
    logger.error({ err: error }, 'GET /admin/intro error')
    res.status(500).json({ success: false, error: 'Failed to get intro' })
  }
})

router.put('/admin/intro', authenticateUser, requirePermission(PERMISSIONS.canbus.update), async (req: Request, res: Response) => {
  try {
    const intro = await canbusSettingsService.updatePageIntro({
      en: typeof req.body?.en === 'string' ? req.body.en : undefined,
      zh: typeof req.body?.zh === 'string' ? req.body.zh : undefined,
    })
    res.json({ success: true, data: intro })
  } catch (error) {
    logger.error({ err: error }, 'PUT /admin/intro error')
    res.status(500).json({ success: false, error: 'Failed to update intro' })
  }
})

export default router
