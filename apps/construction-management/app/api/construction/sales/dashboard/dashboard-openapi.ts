import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

// Booking section
import {
  BOOKING_DASHBOARD_PATH,
  GetConstructionSalesBookingDashboardRequestModel,
  GetConstructionSalesBookingDashboardResponseModel,
} from "./booking-dashboard-models";
// Inquiry section
import {
  GetConstructionSalesInquiryDashboardRequestModel,
  GetConstructionSalesInquiryDashboardResponseModel,
  INQUIRY_DASHBOARD_PATH,
} from "./inquiry-dashboard-models";

/** Sales dashboard models. */
export const salesDashboardOpenApiComponents: OpenApiComponents = {
  // Booking section
  GetConstructionSalesBookingDashboardResponseModel,
  // Inquiry section
  GetConstructionSalesInquiryDashboardResponseModel,
};

/** Sales dashboard operations. */
export const salesDashboardOpenApiOperations: OpenApiOperation[] = [
  // Booking section
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
  // Inquiry section
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
