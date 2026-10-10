import { createProjectLocations } from "@/src/composition/location-resolver";

/**
 * Where the projects context (Wings, Locations) and the masters context
 * (assigned Amenities and Common Developments) meet for the picker.
 */
export const projectLocations = createProjectLocations();
