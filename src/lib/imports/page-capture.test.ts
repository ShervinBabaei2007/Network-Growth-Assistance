// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { captureFromHtml, captureFromText, parseBlocks } from "./page-capture";

// Modelled on a LinkedIn people-search results page copied with Ctrl+A / Ctrl+C.
const PAGE = `
<header><nav>
  <a href="/feed/">Home</a>
  <a href="https://www.linkedin.com/in/me-myself/"><span>Me</span></a>
</nav></header>
<main><ul>
  <li><div class="entity-result">
    <a href="https://www.linkedin.com/in/ada-lovelace-1?miniProfileUrn=urn%3Ali%3Afs"><img alt="Ada Lovelace"></a>
    <div>
      <span><a href="https://www.linkedin.com/in/ada-lovelace-1?miniProfileUrn=urn%3Ali%3Afs">
        <span aria-hidden="true">Ada Lovelace</span><span class="visually-hidden">View Ada Lovelace’s profile</span>
      </a></span>
      <span class="badge"><span aria-hidden="true"> • 2nd</span><span class="visually-hidden">2nd degree connection</span></span>
    </div>
    <div class="primary-subtitle">Computer Engineering Student at <strong>UBC</strong></div>
    <div class="secondary-subtitle">Vancouver, British Columbia, Canada</div>
    <p>Current: Robotics Lead at UBC Thunderbots</p>
    <div>Jane Doe and 3 other mutual connections</div>
    <button><span>Connect</span></button>
  </div></li>
  <li><div class="entity-result">
    <a href="/in/alan-t/"><span aria-hidden="true">Alan T.</span><span class="visually-hidden">View Alan T.’s profile</span></a>
    <div>• 3rd+</div>
    <div>Student at University of Waterloo</div>
    <div>Waterloo, Ontario, Canada</div>
    <button>Message</button>
  </div></li>
  <li><div class="entity-result">
    <a href="https://www.linkedin.com/search/results/people/headless?origin=OTHER"><span>LinkedIn Member</span></a>
    <div>Engineer at Acme</div>
  </div></li>
  <li><div class="entity-result">
    <a href="https://ca.linkedin.com/in/grace-h"><span aria-hidden="true">Grace Hopper</span></a>
    <div>ECE @ U of T | Hardware</div>
    <div>Toronto, Ontario</div>
  </div></li>
</ul></main>`;

describe("captureFromHtml", () => {
  const people = captureFromHtml(PAGE, new DOMParser());

  it("finds each person once, with their profile link", () => {
    expect(people.map((p) => p.key)).toEqual(["ada-lovelace-1", "alan-t", "grace-h"]);
    expect(people[0].url).toBe("https://www.linkedin.com/in/ada-lovelace-1");
  });

  it("reads the name and headline, not the screen-reader or button text", () => {
    expect(people[0]).toMatchObject({ name: "Ada Lovelace", headline: "Computer Engineering Student at UBC" });
    expect(people[1]).toMatchObject({ name: "Alan T.", headline: "Student at University of Waterloo" });
    expect(people[2]).toMatchObject({ name: "Grace Hopper", headline: "ECE @ U of T | Hardware" });
  });

  it("keeps LinkedIn's Current/Past lines as extra context", () => {
    expect(people[0].details).toEqual(["Current: Robotics Lead at UBC Thunderbots"]);
  });

  it("ignores the nav bar's link to your own profile and hidden members", () => {
    expect(people.some((p) => p.name === "Me" || p.key === "me-myself")).toBe(false);
    expect(people.some((p) => /member/i.test(p.name))).toBe(false);
  });
});

describe("parseBlocks", () => {
  it("drops degree markers glued to the name", () => {
    expect(parseBlocks([{ href: "/in/x", lines: ["Sam Lee • 2nd", "CS at SFU"] }])[0]).toMatchObject({ name: "Sam Lee", headline: "CS at SFU" });
  });
});

describe("profile links resolved against another origin", () => {
  it("still identifies the person by the /in/ path", () => {
    const people = captureFromHtml('<ul><li><a href="http://localhost:3000/in/alan-t/"><span>Alan T.</span></a><div>Student</div></li></ul>', new DOMParser());
    expect(people.map((p) => [p.key, p.url])).toEqual([["alan-t", "https://www.linkedin.com/in/alan-t"]]);
  });

  it("ignores other paths on other sites", () => {
    expect(captureFromHtml('<a href="https://example.com/blog/in/review">x</a>', new DOMParser())).toEqual([]);
  });
});

describe("captureFromText", () => {
  it("pulls profile links out of plain text", () => {
    const r = captureFromText("see linkedin.com/in/one and https://ca.linkedin.com/in/Two/?x=1\nhttps://www.linkedin.com/company/acme");
    expect(r.map((p) => p.key)).toEqual(["one", "two"]);
  });
});
