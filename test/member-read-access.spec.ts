import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { BlockGroupsController } from '../src/block-groups/block-groups.controller';
import { EmotionsController } from '../src/emotions/emotions.controller';
import { LiveLookupsController } from '../src/live-lookups/live-lookups.controller';
import { LiveSessionsController } from '../src/live-sessions/live-sessions.controller';
import { ProductsController } from '../src/products/products.controller';
import { ScriptBlocksController } from '../src/script-blocks/script-blocks.controller';
import { SessionReportsController } from '../src/session-reports/session-reports.controller';

type ControllerClass = { prototype: object };

/**
 * Chạy RolesGuard thật trên metadata @Roles của handler + class,
 * trả về true nếu role được phép gọi handler đó.
 */
function canAccess(controller: ControllerClass, handler: string, role: UserRole): boolean {
  const guard = new RolesGuard(new Reflector());
  const context = {
    getHandler: () => (controller.prototype as Record<string, unknown>)[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', email: 'u@live.vcb', role } }) }),
  } as unknown as ExecutionContext;

  try {
    return guard.canActivate(context);
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
}

const MEMBER_CAN_READ: Array<[string, ControllerClass, string]> = [
  ['products.findAll', ProductsController, 'findAll'],
  ['products.findOne', ProductsController, 'findOne'],
  ['script-blocks.findAll', ScriptBlocksController, 'findAll'],
  ['script-blocks.findOne', ScriptBlocksController, 'findOne'],
  ['live-sessions.findAll', LiveSessionsController, 'findAll'],
  ['live-sessions.findOne', LiveSessionsController, 'findOne'],
  ['session-reports.findAll', SessionReportsController, 'findAll'],
  ['session-reports.dailyRankings', SessionReportsController, 'dailyRankings'],
  ['live-lookups.findAll', LiveLookupsController, 'findAll'],
];

const STAFF_ONLY: Array<[string, ControllerClass, string]> = [
  ['products.create', ProductsController, 'create'],
  ['products.uploadImage', ProductsController, 'uploadImage'],
  ['products.update', ProductsController, 'update'],
  ['products.remove', ProductsController, 'remove'],
  ['script-blocks.create', ScriptBlocksController, 'create'],
  ['script-blocks.generateMeaningSuggestion', ScriptBlocksController, 'generateMeaningSuggestion'],
  ['script-blocks.update', ScriptBlocksController, 'update'],
  ['script-blocks.remove', ScriptBlocksController, 'remove'],
  ['live-sessions.create', LiveSessionsController, 'create'],
  ['live-sessions.regenerate', LiveSessionsController, 'regenerate'],
  ['live-sessions.remove', LiveSessionsController, 'remove'],
  ['live-lookups.create', LiveLookupsController, 'create'],
  ['live-lookups.update', LiveLookupsController, 'update'],
  ['live-lookups.remove', LiveLookupsController, 'remove'],
  ['emotions.findAll', EmotionsController, 'findAll'],
  ['block-groups.findAll', BlockGroupsController, 'findAll'],
];

describe('MEMBER read-only access', () => {
  it.each(MEMBER_CAN_READ)('MEMBER được gọi %s', (_name, controller, handler) => {
    expect(canAccess(controller, handler, UserRole.MEMBER)).toBe(true);
  });

  it.each(STAFF_ONLY)('MEMBER bị chặn %s', (_name, controller, handler) => {
    expect(canAccess(controller, handler, UserRole.MEMBER)).toBe(false);
  });

  it.each(STAFF_ONLY)('LEADER vẫn gọi được %s', (_name, controller, handler) => {
    expect(canAccess(controller, handler, UserRole.LEADER)).toBe(true);
  });
});
