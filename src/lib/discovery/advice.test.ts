import { describe, expect, it } from "vitest";
import { testCriteria } from "@/test/discovery";
import { emptyAdvice } from "./advice";

const ce = testCriteria("Find 10 UofT Computer Engineering software engineers");

describe("emptyAdvice", () => {
  it("leads with the most common real reason", () => {
    const people = Array.from({ length: 7 }, () => ({ tierReason: "Weaker evidence for role", program: "Computer Engineering" }));
    people.push({ tierReason: "Weaker evidence for program, role", program: "Electrical and Computer Engineering" });
    const tips = emptyAdvice(ce, people, 8);
    expect(tips[0]).toMatch(/8 people's public pages don't state a current job title/);
    expect(tips[1]).toMatch(/add other names people use for Computer Engineering/);
    expect(tips.at(-1)).toBe("There are 8 possible matches with weaker evidence below.");
  });

  it("suggests ECE only when people actually list ECE", () => {
    const tips = emptyAdvice(ce, [{ tierReason: "Program not verified", program: null }], 0);
    expect(tips.join(" ")).not.toMatch(/ECE/);
    expect(emptyAdvice({ ...ce, education: { ...ce.education, broadenEce: true } }, [{ tierReason: "Weaker evidence for program", program: "Electrical and Computer Engineering" }], 1).join(" ")).not.toMatch(/broadening/);
  });

  it("always has something to say", () => {
    expect(emptyAdvice(ce, [], 0)).toEqual(["Try a broader request (fewer criteria), or run the search again later; public sources change."]);
  });
});
