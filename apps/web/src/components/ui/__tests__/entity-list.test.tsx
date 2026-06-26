import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "jest-axe";

import { Button } from "@/components/ui/button";
import { EntityList, EntityListItem } from "@/components/ui/entity-list";

describe("EntityList", () => {
  it("renders rows with separate actions and no axe violations", async () => {
    const { container } = render(
      <EntityList aria-label="WEGs">
        <EntityListItem
          title={<span>Lindenstrasse 12</span>}
          description="Frankfurt am Main"
          actions={<Button variant="outline">Detail ansehen</Button>}
        />
      </EntityList>,
    );

    expect(document.body).toHaveTextContent("Lindenstrasse 12");
    expect(document.body).toHaveTextContent("Detail ansehen");
    expect(await axe(container)).toHaveNoViolations();
  });
});
