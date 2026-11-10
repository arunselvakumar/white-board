import type {
  ProjectResource,
  ProjectResources,
} from "@/src/queries/project-resources";

/** Story data for a Project's Resources (CM-406). */

export const PROJECT_ID = "0199a1b2-0000-7000-8000-0000000000a1";

export const RESOURCES_API = `/api/construction/projects/projects/${PROJECT_ID}/resources`;

export const OWNER = {
  id: "0199a1b2-0000-7000-8000-000000000101",
  name: "Arun Selva Kumar",
  detail: "Owner",
  isActive: true,
  isOwner: true,
};

export const PRABHU = {
  id: "0199a1b2-0000-7000-8000-000000000102",
  name: "Prabhu Saravanan",
  detail: "Site Engineer",
  isActive: true,
  isOwner: false,
};

export const DEVI: ProjectResource = {
  id: "0199a1b2-0000-7000-8000-000000000103",
  name: "Devi Lakshmi",
  detail: "Store Keeper · Joining Pending",
  isActive: true,
};

export const BALAJI: ProjectResource = {
  id: "0199a1b2-0000-7000-8000-0000000000e1",
  name: "Sri Balaji Constructions",
  detail: "Painting, RCC",
  isActive: true,
};

export const RAMCO: ProjectResource = {
  id: "0199a1b2-0000-7000-8000-0000000000e2",
  name: "Ramco Builders",
  detail: "+91 98400 12345",
  isActive: false,
};

export const SURYA: ProjectResource = {
  id: "0199a1b2-0000-7000-8000-0000000000e3",
  name: "Surya Plumbing Works",
  detail: "Plumbing",
  isActive: true,
};

export const KAVERI: ProjectResource = {
  id: "0199a1b2-0000-7000-8000-0000000000f1",
  name: "Kaveri Cements",
  detail: "Selvam",
  isActive: true,
};

export const MUTHU: ProjectResource = {
  id: "0199a1b2-0000-7000-8000-0000000000b1",
  name: "Muthu Gang",
  detail: "+91 77081 65767",
  isActive: true,
};

export const RESOURCES: ProjectResources = {
  teamMembers: [OWNER, PRABHU],
  contractors: [RAMCO, BALAJI],
  suppliers: [KAVERI],
  vendors: [MUTHU],
};

export const NO_RESOURCES: ProjectResources = {
  teamMembers: [OWNER],
  contractors: [],
  suppliers: [],
  vendors: [],
};
