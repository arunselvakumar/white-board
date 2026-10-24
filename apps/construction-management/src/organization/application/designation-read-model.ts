import type { Designation } from "../domain/designation";

export type DesignationReadModel = {
  id: string;
  name: string;
  isSeed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function toDesignationReadModel(
  item: Designation,
): DesignationReadModel {
  return {
    id: item.id,
    name: item.name,
    isSeed: item.isSeed,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
