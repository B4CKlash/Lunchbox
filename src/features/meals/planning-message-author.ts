/** Shared history must never attribute an unknown or other person's request to the viewer. */
export function planningUserMessageAuthor({ authorMemberId, viewerMemberId, members, shared }: {
  authorMemberId?: string;
  viewerMemberId: string | null | undefined;
  members: readonly { id: string; name: string }[];
  shared: boolean;
}) {
  if (authorMemberId && authorMemberId === viewerMemberId) return "You";
  if (!authorMemberId) return shared ? "Household member" : "You";
  const author = members.find((member) => member.id === authorMemberId);
  if (!author) return "Household member";
  // "You" is also the initial roster name. On the partner's screen it cannot
  // stand in for an actual name or imply that the partner wrote the message.
  if (author.name.trim().toLowerCase() === "you") return viewerMemberId ? "Other household member" : "Household member";
  return author.name;
}
