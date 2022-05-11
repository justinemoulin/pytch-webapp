/// <reference types="cypress" />

import { ProjectTemplateKind } from "../../src/model/projects";

context("Management of project list", () => {
  beforeEach(() => {
    cy.pytchResetDatabase();
    cy.contains("My projects").click();
    cy.location("pathname").should("include", "projects");
  });

  const createProject = (
    name: string,
    template: ProjectTemplateKind,
    invocation: "button" | "enter"
  ) => {
    cy.contains("Create a new project").click();
    cy.get("input[type=text]").type(name);
    cy.get(`button[data-template-slug=${template}`).click();
    if (invocation === "button") {
      cy.get("button").contains("Create project").click();
    } else {
      cy.get("input[type=text]").type("{enter}");
    }
    cy.contains("Project created").should("not.exist");
    cy.pytchHomeFromIDE();
    cy.get(".NavBar").contains("My projects").click();
    cy.get(".ProjectCard").contains(name);
  };

  it("can create a project from the skeleton", () => {
    createProject("Bananas", "button");
    cy.pytchProjectNames().should("deep.equal", [
      "Test seed project",
      "Bananas",
    ]);
    cy.pytchOpenProject("Bananas");
    cy.pytchCodeTextShouldContain("change or delete anything");
    cy.pytchShouldShowAssets(["green-burst.jpg", "python-logo.png"]);
    cy.pytchBuild();
    cy.pytchShouldHaveBuiltWithoutErrors();
  });

  it("can create multiple projects", () => {
    createProject("Bananas", "button");
    createProject("Space Invaders", "enter");
    cy.pytchProjectNames().should("deep.equal", [
      "Test seed project",
      "Bananas",
      "Space Invaders",
    ]);
  });

  [
    {
      label: "Save button",
      action: () => cy.get("button").contains("Save").click(),
    },
    {
      label: "green flag",
      action: () => cy.get(".GreenFlag").click(),
    },
  ].forEach((spec) => {
    it(`can save and re-open projects (via ${spec.label})`, () => {
      createProject("Pac-Person", "button");
      cy.pytchOpenProject("Pac-Person");
      // Erase the skeleton project text before typing our marker.
      cy.get("#pytch-ace-editor").type(
        "{selectall}{backspace}import pytch\n\n# HELLO PAC-PERSON{enter}"
      );
      spec.action();
      cy.pytchSwitchProject("Pac-Person");
      cy.pytchCodeTextShouldContain("HELLO PAC-PERSON");

      cy.pytchSwitchProject("Test seed");
      // The seed project does not have the skeleton project text.
      cy.get("#pytch-ace-editor").type("# HELLO SEED PROJECT{enter}");
      spec.action();

      cy.pytchSwitchProject("Pac-Person");
      cy.pytchCodeTextShouldContain("HELLO PAC-PERSON");

      cy.pytchSwitchProject("Test seed");
      cy.pytchCodeTextShouldContain("HELLO SEED PROJECT");
    });
  });

  it("handles open of non-existent project", () => {
    cy.window().then((window) => {
      const badId = (window as any).PYTCH_CYPRESS.nonExistentProjectId;
      cy.visit(`/ide/${badId}`);
      cy.contains("Sorry, there was a problem");
      cy.title().should("eq", "Pytch: Problem loading project");
      cy.contains("Return to").click();
      cy.contains("My projects");
      cy.contains("Test seed");
    });
  });

  const launchDropdownAction = (projectName: string, actionName: string) => {
    cy.get(".project-name")
      .contains(projectName)
      .parent()
      .parent()
      .within(() => {
        cy.get(".dropdown").click();
        cy.contains(actionName).click();
      });
  };

  it("can rename project", () => {
    createProject("Bananas", "button");
    cy.pytchProjectNames().should("deep.equal", [
      "Test seed project",
      "Bananas",
    ]);
    launchDropdownAction("Bananas", "Rename");
    cy.get("input").as("textField").clear().type("Oranges{enter}");
    cy.get("@textField").should("not.exist");
    cy.pytchProjectNames().should("deep.equal", [
      "Test seed project",
      "Oranges",
    ]);
  });

  const launchDeletion = (projectName: string) => {
    launchDropdownAction(projectName, "DELETE");
  };

  it("can delete a project", () => {
    createProject("Apples", "enter");
    createProject("Bananas", "button");
    cy.pytchProjectNames().should("deep.equal", [
      "Test seed project",
      "Apples",
      "Bananas",
    ]);
    launchDeletion("Apples");
    cy.contains("Are you sure");
    cy.get("button").contains("DELETE").click();
    cy.pytchProjectNames().should("deep.equal", [
      "Test seed project",
      "Bananas",
    ]);
  });

  [
    {
      label: "escape key",
      invoke: () => cy.contains("Are you sure").type("{esc}"),
    },
    {
      label: "cancel button",
      invoke: () => cy.get("button").contains("Cancel").click(),
    },
  ].forEach((cancelMethod) => {
    it(`can cancel project deletion (via ${cancelMethod.label})`, () => {
      createProject("Apples", "button");
      createProject("Bananas", "enter");

      launchDeletion("Apples");
      cancelMethod.invoke();
      cy.contains("Are you sure").should("not.exist");
      cy.pytchProjectNames().should("deep.equal", [
        "Test seed project",
        "Apples",
        "Bananas",
      ]);
    });
  });
});
