import { AppShellPage } from "./AppShellPage";

export class ProjectsPage extends AppShellPage {
  public get url() {
    return "/app/projects";
  }

  public get pageHeading() {
    return this.heading("Projects", { level: 1 });
  }

  public get addProjectLink() {
    return this.page.getByRole("link", { name: /Add (your first )?Project/ });
  }

  public projectCard(name: string) {
    return this.page.getByRole("link", { name: new RegExp(name) });
  }

  public statusFilter(name: string) {
    return this.page
      .getByRole("tablist", { name: "Status" })
      .getByRole("tab", { name: new RegExp(`^${name} \\d+`) });
  }

  /** The folder of one client's Projects (ADR CM-0027). */
  public clientGroup(client: string) {
    return this.page
      .getByRole("group", { name: "Projects" })
      .getByRole("region", { name: new RegExp(`^${client}`) });
  }

  public optionsButton(projectName: string) {
    return this.button(`Options for ${projectName}`);
  }

  public get emptyState() {
    return this.page.getByText("No Projects yet");
  }
}
