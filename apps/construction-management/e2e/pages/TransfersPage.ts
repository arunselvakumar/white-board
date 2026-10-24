import { ProjectPage } from "./ProjectPage";

/** Materials → Transfers: a new Material Transfer between Projects (CM-507). */
export class TransfersPage extends ProjectPage {
  public get url() {
    return `${this.base}/materials/transfers/new`;
  }
}
