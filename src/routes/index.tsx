import { createFileRoute } from "@tanstack/react-router";
import { Homepage } from "../components/homepage";

export const Route = createFileRoute("/")({ component: Homepage });
