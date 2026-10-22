/**
 * Compile-time checks that the modules' real events still fit what
 * messaging's listeners read (`src/messaging/application/inbound-events.ts`).
 * Messaging cannot import another context, so its copies are structural;
 * if an event loses or renames a field, this file stops compiling.
 */
import type {
  InboundBackupFinished,
  InboundBookingEvent,
  InboundEquipmentFuelOverrun,
  InboundInspectionDecided,
  InboundInspectionRequested,
  InboundIssueEvent,
  InboundMaterialRequestDelivered,
  InboundMaterialRequestRaised,
  InboundMaterialTransferDelivered,
  InboundMaterialTransferSent,
  InboundReportFinished,
  InboundSalaryDecided,
  InboundStockBelowMinimum,
  InboundTaskAssigned,
  InboundTaskCompleted,
} from "@/src/messaging/application/inbound-events";
import type {
  MaterialRequestDelivered,
  MaterialRequestRaised,
  MaterialTransferDelivered,
  MaterialTransferSent,
  StockBelowMinimum,
} from "@/src/procurement/domain/events";
import type { SalaryApproved, SalaryPaid } from "@/src/hrms/domain/events";
import type {
  BackupFinished,
  ReportFinished,
} from "@/src/reporting/domain/events";
import type { EquipmentFuelOverrun } from "@/src/site-work/domain/events";
import type { BookingEvent } from "@/src/sales/domain/booking-events";
import type {
  InspectionDecided,
  InspectionRequested,
  IssueEvent,
  TaskAssigned,
  TaskCompleted,
} from "@/src/tracking/domain/events";
// Sales (CM-1004)
import type {
  InboundImportedInquiriesAssigned,
  InboundInquiryAssigned,
} from "@/src/messaging/application/inbound-events";
import type {
  ImportedInquiriesAssigned,
  InquiryAssigned,
} from "@/src/sales/domain/inquiry-events";
// Contracts (CM-1104)
import type { InboundWorkOrderIssued } from "@/src/messaging/application/inbound-events";
import type { WorkOrderIssued } from "@/src/contracts/domain/work-order-events";

type Fits<Real extends Inbound, Inbound> = Real;

export type MessagingEventContracts = [
  Fits<TaskAssigned, InboundTaskAssigned>,
  Fits<TaskCompleted, InboundTaskCompleted>,
  Fits<IssueEvent, InboundIssueEvent>,
  Fits<InspectionRequested, InboundInspectionRequested>,
  Fits<InspectionDecided, InboundInspectionDecided>,
  Fits<EquipmentFuelOverrun, InboundEquipmentFuelOverrun>,
  Fits<StockBelowMinimum, InboundStockBelowMinimum>,
  Fits<MaterialTransferSent, InboundMaterialTransferSent>,
  Fits<MaterialTransferDelivered, InboundMaterialTransferDelivered>,
  Fits<MaterialRequestRaised, InboundMaterialRequestRaised>,
  Fits<MaterialRequestDelivered, InboundMaterialRequestDelivered>,
  Fits<SalaryApproved, InboundSalaryDecided>,
  Fits<SalaryPaid, InboundSalaryDecided>,
  Fits<ReportFinished, InboundReportFinished>,
  Fits<BackupFinished, InboundBackupFinished>,
  // Sales (CM-1006)
  Fits<BookingEvent, InboundBookingEvent>,
  // Sales (CM-1004)
  Fits<InquiryAssigned, InboundInquiryAssigned>,
  Fits<ImportedInquiriesAssigned, InboundImportedInquiriesAssigned>,
  // Contracts (CM-1104)
  Fits<WorkOrderIssued, InboundWorkOrderIssued>,
];
