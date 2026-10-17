import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

// Booking section (CM-1008)
import {
  BOOKING_DASHBOARD_PATH,
  GetConstructionSalesBookingDashboardRequestModel,
  GetConstructionSalesBookingDashboardResponseModel,
} from "./booking-dashboard-models";
// Inquiry section (CM-1008)
import {
  GetConstructionSalesInquiryDashboardRequestModel,
  GetConstructionSalesInquiryDashboardResponseModel,
  INQUIRY_DASHBOARD_PATH,
} from "./inquiry-dashboard-models";

/** Sales dashboard models (CM-1008). */
export const salesDashboardOpenApiComponents: OpenApiComponents = {
  // Booking section (CM-1008)
  GetConstructionSalesBookingDashboardResponseModel,
  // Inquiry section (CM-1008)
  GetConstructionSalesInquiryDashboardResponseModel,
};

/** Sales dashboard operations (CM-1008). */
export const salesDashboardOpenApiOperations: OpenApiOperation[] = [
  // Booking section (CM-1008)
  {
    method: "get",
    path: BOOKING_DASHBOARD_PATH,
    summary:
      "The Project Dashboard's Booking section: units by sales status and the latest bookings",
    tags: ["Construction · Sales"],
    query: GetConstructionSalesBookingDashboardRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Booking section",
    successSchema: GetConstructionSalesBookingDashboardResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
    ],
  },
  // Inquiry section (CM-1008)
  {
    method: "get",
    path: INQUIRY_DASHBOARD_PATH,
    summary:
      "The Project Dashboard's Inquiry section: totals, funnel, lead sources, sales team and Call Activity",
    tags: ["Construction · Sales"],
    query: GetConstructionSalesInquiryDashboardRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Inquiry section",
    successSchema: GetConstructionSalesInquiryDashboardResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
    ],
  },
];
