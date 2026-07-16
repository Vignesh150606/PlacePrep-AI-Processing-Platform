import { Briefcase, GraduationCap, Handshake, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import type { AlumniProfile } from "@placeprep/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

interface AlumniCardProps {
  alumni: AlumniProfile;
  /** Hide the company badge when the card already lives on that company's
   * own page (Company Hub's Alumni tab) -- redundant there, same reasoning
   * `ResourceCard`'s `hideCompanyBadge` uses. */
  hideCompanyBadge?: boolean;
  onClick?: () => void;
}

export function AlumniCard({ alumni, hideCompanyBadge, onClick }: AlumniCardProps) {
  const displayName = alumni.isAnonymous ? "Anonymous Alumnus" : alumni.fullName;

  return (
    <Card
      className="flex flex-col gap-3 p-5 text-left transition-colors hover:border-accent-600/40"
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="flex items-start gap-3">
        <Avatar className="size-11">
          {!alumni.isAnonymous && alumni.avatarUrl && <AvatarImage src={alumni.avatarUrl} alt={displayName} />}
          <AvatarFallback>{initials(displayName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-foreground">{displayName}</h3>
            {alumni.verificationStatus === "verified" && (
              <ShieldCheck className="size-3.5 shrink-0 text-accent-600" aria-label="Verified alumnus" />
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {alumni.currentRole}
            {!hideCompanyBadge && alumni.currentCompanyName && <> · {alumni.currentCompanyName}</>}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="neutral">
          <GraduationCap className="size-3" /> Class of {alumni.graduationYear}
        </Badge>
        {alumni.department && <Badge variant="neutral">{alumni.department}</Badge>}
        {alumni.location && (
          <Badge variant="neutral">
            <MapPin className="size-3" /> {alumni.location}
          </Badge>
        )}
        {alumni.mentorshipAvailable && (
          <Badge variant="accent">
            <Handshake className="size-3" /> Open to mentor
          </Badge>
        )}
      </div>

      {alumni.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{alumni.bio}</p>}

      {alumni.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {alumni.skills.slice(0, 5).map((skill) => (
            <Badge key={skill} variant="neutral" className="text-[11px]">
              {skill}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Briefcase className="size-3.5" /> {alumni.contributionCount} contributions
        </span>
        <span className="flex items-center gap-1">
          <Sparkles className="size-3.5" /> {alumni.helpfulVotesReceived} helpful votes
        </span>
      </div>
    </Card>
  );
}
