import { useMemo, useState } from "react";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import {
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  ListTree,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Wifi,
} from "lucide-react";
import type { CalendarEvent, CalendarEventStatus, CalendarEventType } from "@placeprep/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/use-profile";
import { useCompanies } from "@/hooks/use-companies";
import {
  useCreatePlacementEvent,
  useDeletePlacementEvent,
  usePlacementEvents,
  useUpdatePlacementEvent,
  type PlacementEventInput,
} from "@/hooks/use-calendar";
import { ApiError } from "@/lib/api-client";

const TYPE_LABELS: Record<CalendarEventType, string> = {
  oa: "Online Assessment",
  interview: "Interview",
  "company-visit": "Company Visit",
  reminder: "Reminder",
  workshop: "Workshop",
};

const STATUS_VARIANT: Record<CalendarEventStatus, "accent" | "correct" | "neutral" | "incorrect"> = {
  upcoming: "accent",
  ongoing: "correct",
  completed: "neutral",
  cancelled: "incorrect",
};

const eventSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  type: z.enum(["oa", "interview", "company-visit", "reminder", "workshop"]),
  companyId: z.string().nullable(),
  startAt: z.string().min(1, "Drive date/time is required"),
  endAt: z.string().nullable(),
  isAllDay: z.boolean(),
  role: z.string().nullable(),
  packageLpa: z.number().nullable(),
  eligibility: z.string().nullable(),
  registrationDeadline: z.string().nullable(),
  venue: z.string().nullable(),
  isOnline: z.boolean(),
  applicationLink: z.string().nullable(),
  description: z.string().nullable(),
  status: z.enum(["upcoming", "ongoing", "completed", "cancelled"]),
});

type EventFormValues = z.infer<typeof eventSchema>;

const EMPTY_FORM: EventFormValues = {
  title: "",
  type: "company-visit",
  companyId: null,
  startAt: "",
  endAt: null,
  isAllDay: false,
  role: null,
  packageLpa: null,
  eligibility: null,
  registrationDeadline: null,
  venue: null,
  isOnline: false,
  applicationLink: null,
  description: null,
  status: "upcoming",
};

// datetime-local wants "YYYY-MM-DDTHH:mm" with no timezone/seconds.
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const selectClass =
  "h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const textareaClass =
  "min-h-20 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function EventFormDialog({
  open,
  onOpenChange,
  editingEvent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingEvent: CalendarEvent | null;
}) {
  const { data: companyData } = useCompanies();
  const companies = companyData?.items ?? [];
  const create = useCreatePlacementEvent();
  const update = useUpdatePlacementEvent();
  const isSaving = create.isPending || update.isPending;

  const { control, handleSubmit, register, watch } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    values: editingEvent
      ? {
          title: editingEvent.title,
          type: editingEvent.type,
          companyId: editingEvent.companyId,
          startAt: toDatetimeLocal(editingEvent.startAt),
          endAt: toDatetimeLocal(editingEvent.endAt) || null,
          isAllDay: editingEvent.isAllDay,
          role: editingEvent.role ?? null,
          packageLpa: editingEvent.packageLpa ?? null,
          eligibility: editingEvent.eligibility ?? null,
          registrationDeadline: toDatetimeLocal(editingEvent.registrationDeadline) || null,
          venue: editingEvent.venue ?? null,
          isOnline: editingEvent.isOnline ?? false,
          applicationLink: editingEvent.applicationLink ?? null,
          description: editingEvent.description,
          status: editingEvent.status ?? "upcoming",
        }
      : EMPTY_FORM,
  });

  const isOnline = watch("isOnline");

  const onSubmit = (values: EventFormValues) => {
    const payload: PlacementEventInput = {
      ...values,
      startAt: fromDatetimeLocal(values.startAt) ?? values.startAt,
      endAt: fromDatetimeLocal(values.endAt),
      registrationDeadline: fromDatetimeLocal(values.registrationDeadline),
    };

    if (editingEvent) {
      update.mutate(
        { id: editingEvent.id, ...payload },
        {
          onSuccess: () => {
            toast.success("Event updated.");
            onOpenChange(false);
          },
          onError: (err) => toast.error(err instanceof ApiError ? err.message : "Update failed."),
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success("Placement event created.");
          onOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Create failed."),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingEvent ? "Edit placement event" : "New placement event"}</DialogTitle>
          <DialogDescription>
            {editingEvent
              ? "Changes are visible to all students immediately."
              : "Visible to all students immediately after saving."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" placeholder="e.g. Amazon — SDE-1 Campus Drive" {...register("title")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="type">Type</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <select id="type" className={selectClass} {...field}>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="companyId">Company</Label>
              <Controller
                control={control}
                name="companyId"
                render={({ field }) => (
                  <select
                    id="companyId"
                    className={selectClass}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value || null)}
                  >
                    <option value="">— Not company-specific —</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="role">Role</Label>
              <Input id="role" placeholder="e.g. SDE-1" {...register("role")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="packageLpa">Package (LPA)</Label>
              <Controller
                control={control}
                name="packageLpa"
                render={({ field }) => (
                  <Input
                    id="packageLpa"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="e.g. 12.5"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                  />
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="eligibility">Eligibility</Label>
            <Controller
              control={control}
              name="eligibility"
              render={({ field }) => (
                <textarea
                  id="eligibility"
                  className={textareaClass}
                  placeholder="e.g. CGPA ≥ 7.0, no active backlogs, CSE/IT/ECE only"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value || null)}
                />
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="registrationDeadline">Registration deadline</Label>
              <Input id="registrationDeadline" type="datetime-local" {...register("registrationDeadline")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="startAt">Drive date/time</Label>
              <Input id="startAt" type="datetime-local" {...register("startAt")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="flex flex-col gap-2">
              <Label htmlFor="venue">{isOnline ? "Meeting link / platform" : "Venue"}</Label>
              <Input
                id="venue"
                placeholder={isOnline ? "e.g. Google Meet" : "e.g. Main Auditorium"}
                {...register("venue")}
              />
            </div>
            <Controller
              control={control}
              name="isOnline"
              render={({ field }) => (
                <label className="flex h-9 items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="size-4 rounded border-border"
                  />
                  Online drive
                </label>
              )}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="applicationLink">Application link</Label>
            <Input id="applicationLink" placeholder="https://…" {...register("applicationLink")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <textarea
                  id="description"
                  className={textareaClass}
                  placeholder="Any other details students should know"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value || null)}
                />
              )}
            />
          </div>

          {editingEvent && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="status">Status</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <select id="status" className={selectClass} {...field}>
                    <option value="upcoming">Upcoming</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                )}
              />
            </div>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSaving}>
              {editingEvent ? "Save changes" : "Create event"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EventMeta({ event }: { event: CalendarEvent }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <Clock className="size-3.5" /> {formatDateTime(event.startAt)}
      </span>
      {event.venue && (
        <span className="inline-flex items-center gap-1">
          {event.isOnline ? <Wifi className="size-3.5" /> : <MapPin className="size-3.5" />} {event.venue}
        </span>
      )}
      {typeof event.packageLpa === "number" && <span>₹{event.packageLpa} LPA</span>}
      {event.registrationDeadline && <span>Register by {formatDate(event.registrationDeadline)}</span>}
    </div>
  );
}

// Exported for reuse by company-detail-page.tsx's "Upcoming events" section
// (read-only there -- isAdmin is always passed false so the edit/delete
// buttons never render, rather than bringing the full edit-dialog
// machinery onto what's meant to be a student-facing prep page).
export function EventRow({
  event,
  isAdmin,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-foreground">{event.title}</p>
              <Badge variant="neutral">{TYPE_LABELS[event.type]}</Badge>
              {event.role && <Badge variant="accent">{event.role}</Badge>}
              <Badge variant={STATUS_VARIANT[event.status ?? "upcoming"]} className="capitalize">
                {event.status ?? "upcoming"}
              </Badge>
            </div>
            <EventMeta event={event} />
            {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {event.applicationLink && (
              <Button variant="ghost" size="icon" asChild>
                <a href={event.applicationLink} target="_blank" rel="noreferrer" aria-label="Open application link">
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            )}
            {isAdmin && (
              <>
                <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit event">
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete event">
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ListView({
  events,
  isAdmin,
  onEdit,
  onDelete,
}: {
  events: CalendarEvent[];
  isAdmin: boolean;
  onEdit: (e: CalendarEvent) => void;
  onDelete: (e: CalendarEvent) => void;
}) {
  const now = Date.now();
  const upcoming = events.filter((e) => new Date(e.startAt).getTime() >= now && e.status !== "cancelled");
  const past = events.filter((e) => new Date(e.startAt).getTime() < now || e.status === "cancelled");

  return (
    <div className="flex flex-col gap-6">
      {upcoming.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</h3>
          {upcoming.map((e) => (
            <EventRow key={e.id} event={e} isAdmin={isAdmin} onEdit={() => onEdit(e)} onDelete={() => onDelete(e)} />
          ))}
        </div>
      )}
      {past.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Past &amp; cancelled</h3>
          {past.map((e) => (
            <EventRow key={e.id} event={e} isAdmin={isAdmin} onEdit={() => onEdit(e)} onDelete={() => onDelete(e)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineView({
  events,
  isAdmin,
  onEdit,
  onDelete,
}: {
  events: CalendarEvent[];
  isAdmin: boolean;
  onEdit: (e: CalendarEvent) => void;
  onDelete: (e: CalendarEvent) => void;
}) {
  const groups = useMemo(() => {
    const byMonth = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const d = new Date(e.startAt);
      const key = d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(e);
    }
    return Array.from(byMonth.entries());
  }, [events]);

  return (
    <div className="flex flex-col gap-8">
      {groups.map(([month, monthEvents]) => (
        <div key={month} className="flex gap-4">
          <div className="w-28 shrink-0 pt-1 text-sm font-medium text-muted-foreground">{month}</div>
          <div className="flex flex-1 flex-col gap-3 border-l border-border pl-4">
            {monthEvents.map((e) => (
              <div key={e.id} className="relative">
                <div className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-accent-600" />
                <EventRow event={e} isAdmin={isAdmin} onEdit={() => onEdit(e)} onDelete={() => onDelete(e)} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarView({
  events,
  onSelectDay,
  selectedDay,
}: {
  events: CalendarEvent[];
  onSelectDay: (day: Date | null) => void;
  selectedDay: Date | null;
}) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const d = new Date(e.startAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  const weeks = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = Array(firstDay.getDay()).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    const result: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) result.push(cells.slice(i, i + 7));
    return result;
  }, [viewDate]);

  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = new Date();
  const isSameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <p className="text-sm font-semibold text-foreground">
          {viewDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        </p>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((day, i) => {
          const dayEvents = day ? eventsByDay.get(dayKey(day)) ?? [] : [];
          return (
            <button
              key={i}
              type="button"
              disabled={!day}
              onClick={() => onSelectDay(day)}
              className={cn(
                "flex aspect-square flex-col items-center justify-start gap-0.5 rounded-lg p-1 text-xs transition-colors",
                !day && "invisible",
                day && "hover:bg-surface",
                day && selectedDay && isSameDay(day, selectedDay) && "bg-accent-600/10 ring-1 ring-accent-600",
              )}
            >
              <span className={cn("font-medium", day && isSameDay(day, today) && "text-accent-600")}>
                {day?.getDate()}
              </span>
              {dayEvents.length > 0 && (
                <span className="flex gap-0.5">
                  {dayEvents.slice(0, 3).map((_, idx) => (
                    <span key={idx} className="size-1 rounded-full bg-accent-600" />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PlacementCalendarPage() {
  const isAdmin = useIsAdmin();
  const { data, isLoading, isError, refetch } = usePlacementEvents();
  const deleteEvent = useDeletePlacementEvent();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const events = useMemo(() => data?.items ?? [], [data]);

  const eventsForSelectedDay = useMemo(() => {
    if (!selectedDay) return [];
    return events.filter((e) => {
      const d = new Date(e.startAt);
      return (
        d.getFullYear() === selectedDay.getFullYear() &&
        d.getMonth() === selectedDay.getMonth() &&
        d.getDate() === selectedDay.getDate()
      );
    });
  }, [events, selectedDay]);

  const openCreate = () => {
    setEditingEvent(null);
    setDialogOpen(true);
  };
  const openEdit = (e: CalendarEvent) => {
    setEditingEvent(e);
    setDialogOpen(true);
  };
  const handleDelete = (e: CalendarEvent) => {
    if (!window.confirm(`Delete "${e.title}"? This can't be undone.`)) return;
    deleteEvent.mutate(e.id, {
      onSuccess: () => toast.success("Event deleted."),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Delete failed."),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Placement Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Company drives, OAs, and interview rounds — managed by admins, visible to everyone.
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> New event
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load the placement calendar." onRetry={() => refetch()} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No placement events yet"
          description={
            isAdmin
              ? "Create the first event to let students know what's coming up."
              : "Check back soon — admins will post company drives, OAs, and interview rounds here."
          }
          action={
            isAdmin ? (
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4" /> New event
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">
              <Building2 className="size-3.5" /> List
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarRange className="size-3.5" /> Calendar
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <ListTree className="size-3.5" /> Timeline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <ListView events={events} isAdmin={isAdmin} onEdit={openEdit} onDelete={handleDelete} />
          </TabsContent>

          <TabsContent value="calendar">
            <div className="flex flex-col gap-4 lg:flex-row">
              <Card className="lg:w-96">
                <CardHeader>
                  <CardTitle>Month view</CardTitle>
                </CardHeader>
                <CardContent>
                  <CalendarView events={events} onSelectDay={setSelectedDay} selectedDay={selectedDay} />
                </CardContent>
              </Card>
              <div className="flex flex-1 flex-col gap-2">
                {selectedDay ? (
                  eventsForSelectedDay.length > 0 ? (
                    eventsForSelectedDay.map((e) => (
                      <EventRow
                        key={e.id}
                        event={e}
                        isAdmin={isAdmin}
                        onEdit={() => openEdit(e)}
                        onDelete={() => handleDelete(e)}
                      />
                    ))
                  ) : (
                    <EmptyState icon={CalendarDays} title="Nothing on this day" />
                  )
                ) : (
                  <EmptyState
                    icon={CalendarDays}
                    title="Pick a day"
                    description="Select a date on the calendar to see what's happening."
                  />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="timeline">
            <TimelineView events={events} isAdmin={isAdmin} onEdit={openEdit} onDelete={handleDelete} />
          </TabsContent>
        </Tabs>
      )}

      {isAdmin && <EventFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editingEvent={editingEvent} />}
    </div>
  );
}
