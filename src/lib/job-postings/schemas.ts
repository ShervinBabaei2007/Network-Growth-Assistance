import { z } from "zod";
import { Requirement, RequirementResult } from "./types";

/** Shapes of JSON columns, for reading them back safely. */

export const PostingLinkList = z.array(z.object({ publisher: z.string(), url: z.string() }));

export const StoredFit = z.object({ requirements: z.array(Requirement), results: z.array(RequirementResult) });
export type StoredFit = z.infer<typeof StoredFit>;
