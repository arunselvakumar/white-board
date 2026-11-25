import { StatusCodes } from "http-status-codes";

import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  CreatePreschoolAnnouncementRequestModel,
  ListPreschoolAnnouncementsRequestModel,
  ListPreschoolAnnouncementsResponseModel,
  PreschoolAnnouncementModel,
  PreschoolAnnouncementParamsModel,
  PreschoolFamilyAnnouncementsRequestModel,
  PreschoolFamilyAnnouncementsResponseModel,
  PreschoolUpcomingAnnouncementsRequestModel,
  PreschoolUpcomingAnnouncementsResponseModel,
  UpdatePreschoolAnnouncementRequestModel,
} from "./announcement-models";

const PATH = "/api/preschool/announcements";
const tags = ["Preschool"];
const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
];
const WRITE_ERRORS = [...READ_ERRORS, StatusCodes.NOT_FOUND];

export const announcementsOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: PATH,
      summary:
        "Announcements that reach a Centre (a Teacher: whole-Centre and their Classrooms')",
      tags,
      query: ListPreschoolAnnouncementsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "A page of Announcements, newest first",
      successSchema: ListPreschoolAnnouncementsResponseModel,
      errors: READ_ERRORS,
    },
    {
      method: "post",
      path: PATH,
      summary: "Post an Announcement; the Parents it reaches are emailed",
      tags,
      body: CreatePreschoolAnnouncementRequestModel,
      successStatus: StatusCodes.CREATED,
      successDescription: "The Announcement",
      successSchema: PreschoolAnnouncementModel,
      errors: WRITE_ERRORS,
    },
    {
      method: "get",
      path: `${PATH}/upcoming`,
      summary: "Events and holidays in the next 60 days",
      tags,
      query: PreschoolUpcomingAnnouncementsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "Soonest first",
      successSchema: PreschoolUpcomingAnnouncementsResponseModel,
      errors: READ_ERRORS,
    },
    {
      method: "get",
      path: `${PATH}/family`,
      summary: "A Parent's Announcements and what is coming up",
      tags,
      query: PreschoolFamilyAnnouncementsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "A page of Announcements and the upcoming ones",
      successSchema: PreschoolFamilyAnnouncementsResponseModel,
      errors: READ_ERRORS,
    },
    {
      method: "post",
      path: `${PATH}/{id}/details`,
      summary: "Edit an Announcement (its author or a manager of the Centre)",
      tags,
      params: PreschoolAnnouncementParamsModel,
      body: UpdatePreschoolAnnouncementRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Announcement",
      successSchema: PreschoolAnnouncementModel,
      errors: WRITE_ERRORS,
    },
    {
      method: "post",
      path: `${PATH}/{id}/remove`,
      summary: "Remove an Announcement",
      tags,
      params: PreschoolAnnouncementParamsModel,
      successStatus: StatusCodes.NO_CONTENT,
      successDescription: "Removed",
      errors: WRITE_ERRORS,
    },
  ],
  components: {
    PreschoolAnnouncementModel,
    CreatePreschoolAnnouncementRequestModel,
    UpdatePreschoolAnnouncementRequestModel,
    ListPreschoolAnnouncementsResponseModel,
    PreschoolUpcomingAnnouncementsResponseModel,
    PreschoolFamilyAnnouncementsResponseModel,
  },
};
