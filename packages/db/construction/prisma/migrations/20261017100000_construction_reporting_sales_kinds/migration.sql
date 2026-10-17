-- Sales report kinds (CM-1008, ADR CM-0022 §11): the Inquiry Report and the
-- Booking Report. construction_reporting only (ADR-0030).

ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'inquiry_report';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'booking_report';
