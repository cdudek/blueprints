import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware navigation: use this Link instead of next/link. The same call also returns
// redirect, usePathname, useRouter and getPathname; export them here when a page needs them.
export const { Link } = createNavigation(routing);
