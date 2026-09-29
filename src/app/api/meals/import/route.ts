import { createImportHandler } from "@/features/meals/import-handler";

export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = createImportHandler();
