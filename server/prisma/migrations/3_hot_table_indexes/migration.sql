-- P1-B11 热表索引：审计/通知/工单/提现申请补查询列索引，防数据量增长后列表接口全表扫描拖库。
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");
CREATE INDEX "AuditLog_category_at_idx" ON "AuditLog"("category", "at");
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "Notification_scopeType_scopeId_createdAt_idx" ON "Notification"("scopeType", "scopeId", "createdAt");
CREATE INDEX "Ticket_brandId_status_idx" ON "Ticket"("brandId", "status");
CREATE INDEX "Ticket_agentId_status_idx" ON "Ticket"("agentId", "status");
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX "PayoutRequest_agentId_status_idx" ON "PayoutRequest"("agentId", "status");
CREATE INDEX "PayoutRequest_status_createdAt_idx" ON "PayoutRequest"("status", "createdAt");
