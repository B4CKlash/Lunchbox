import { AccountPanel } from "@/components/account-panel";
export default function AccountPage() { return <AccountPanel inviteOnly={process.env.LUNCHBOX_HOUSEHOLD_ENABLED === "true"} />; }
