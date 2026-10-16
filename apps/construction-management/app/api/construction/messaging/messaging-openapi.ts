import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionMessagingNotificationParamsModel,
  ConstructionMessagingNotificationResponseModel,
  ConstructionMessagingPreferencesResponseModel,
  ConstructionMessagingPushConfigResponseModel,
  ConstructionMessagingPushSubscriptionResponseModel,
  CreateConstructionMessagingPushSubscriptionRequestModel,
  DeleteConstructionMessagingPushSubscriptionRequestModel,
  GetConstructionMessagingUnreadCountResponseModel,
  ListConstructionMessagingNotificationsRequestModel,
  ListConstructionMessagingNotificationsResponseModel,
  MarkAllConstructionMessagingNotificationsReadResponseModel,
  MESSAGING_PATH,
  NOTIFICATIONS_PATH,
  UpdateConstructionMessagingPreferencesRequestModel,
} from "./messaging-models";

const TAGS = ["Construction · Messaging"];

const COMPANY_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
];

const USER_ERRORS = [StatusCodes.BAD_REQUEST, StatusCodes.UNAUTHORIZED];

/** Request and Response models of `/api/construction/messaging` (CM-904). */
export const messagingOpenApiComponents: OpenApiComponents = {
  ConstructionMessagingNotificationResponseModel,
  ListConstructionMessagingNotificationsResponseModel,
  GetConstructionMessagingUnreadCountResponseModel,
  MarkAllConstructionMessagingNotificationsReadResponseModel,
  CreateConstructionMessagingPushSubscriptionRequestModel,
  DeleteConstructionMessagingPushSubscriptionRequestModel,
  ConstructionMessagingPushSubscriptionResponseModel,
  ConstructionMessagingPreferencesResponseModel,
  UpdateConstructionMessagingPreferencesRequestModel,
  ConstructionMessagingPushConfigResponseModel,
};

export const messagingOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: NOTIFICATIONS_PATH,
    summary:
      "The member's notifications in the Active Company, newest first (cursor)",
    tags: TAGS,
    query: ListConstructionMessagingNotificationsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of notifications",
    successSchema: ListConstructionMessagingNotificationsResponseModel,
    errors: COMPANY_ERRORS,
  },
  {
    method: "get",
    path: `${NOTIFICATIONS_PATH}/unread-count`,
    summary:
      "The bell's unread count and the newest unread report/backup/export ready notification (the Download toast)",
    tags: TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "Unread count",
    successSchema: GetConstructionMessagingUnreadCountResponseModel,
    errors: COMPANY_ERRORS,
  },
  {
    method: "post",
    path: `${NOTIFICATIONS_PATH}/{id}/read`,
    summary: "Mark one of the member's notifications read",
    tags: TAGS,
    params: ConstructionMessagingNotificationParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The notification",
    successSchema: ConstructionMessagingNotificationResponseModel,
    errors: [...COMPANY_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${NOTIFICATIONS_PATH}/read-all`,
    summary: "Mark all the member's notifications in the Active Company read",
    tags: TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "How many were marked read",
    successSchema: MarkAllConstructionMessagingNotificationsReadResponseModel,
    errors: COMPANY_ERRORS,
  },
  {
    method: "post",
    path: `${NOTIFICATIONS_PATH}/{id}/delete`,
    summary:
      "Delete one of the member's notifications from their list (the delivery log stays)",
    tags: TAGS,
    params: ConstructionMessagingNotificationParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...COMPANY_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${MESSAGING_PATH}/push-subscriptions`,
    summary:
      "Turn on notifications on this device: store the browser's web push subscription for this session",
    tags: TAGS,
    body: CreateConstructionMessagingPushSubscriptionRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "Subscribed",
    successSchema: ConstructionMessagingPushSubscriptionResponseModel,
    errors: USER_ERRORS,
  },
  {
    method: "post",
    path: `${MESSAGING_PATH}/push-subscriptions/delete`,
    summary: "Turn off notifications on this device",
    tags: TAGS,
    body: DeleteConstructionMessagingPushSubscriptionRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Unsubscribed",
    errors: USER_ERRORS,
  },
  {
    method: "get",
    path: `${MESSAGING_PATH}/preferences`,
    summary: "The User's push switches, one per menu group",
    tags: TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "Preferences",
    successSchema: ConstructionMessagingPreferencesResponseModel,
    errors: USER_ERRORS,
  },
  {
    method: "post",
    path: `${MESSAGING_PATH}/preferences/update`,
    summary: "Set the menu groups whose push is muted",
    tags: TAGS,
    body: UpdateConstructionMessagingPreferencesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Preferences",
    successSchema: ConstructionMessagingPreferencesResponseModel,
    errors: USER_ERRORS,
  },
  {
    method: "get",
    path: `${MESSAGING_PATH}/push/config`,
    summary:
      "The VAPID public key a browser subscribes with (null: push is off)",
    tags: TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "Push configuration",
    successSchema: ConstructionMessagingPushConfigResponseModel,
    errors: [StatusCodes.UNAUTHORIZED],
  },
];
