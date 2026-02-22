"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { isValidReference } from "@/lib/reference";

/* ─── Bible data ─── */

const BIBLE_BOOKS = [
  "Genesis","Exodus","Leviticus","Numbers","Deuteronomy",
  "Joshua","Judges","Ruth","1 Samuel","2 Samuel",
  "1 Kings","2 Kings","1 Chronicles","2 Chronicles",
  "Ezra","Nehemiah","Esther","Job","Psalms","Proverbs",
  "Ecclesiastes","Song of Solomon","Isaiah","Jeremiah",
  "Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos",
  "Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah",
  "Haggai","Zechariah","Malachi",
  "Matthew","Mark","Luke","John","Acts","Romans",
  "1 Corinthians","2 Corinthians","Galatians","Ephesians",
  "Philippians","Colossians","1 Thessalonians","2 Thessalonians",
  "1 Timothy","2 Timothy","Titus","Philemon","Hebrews",
  "James","1 Peter","2 Peter","1 John","2 John","3 John",
  "Jude","Revelation",
];

const BIBLE_CHAPTERS: Record<string, number> = {
  Genesis:50,Exodus:40,Leviticus:27,Numbers:36,Deuteronomy:34,
  Joshua:24,Judges:21,Ruth:4,"1 Samuel":31,"2 Samuel":24,
  "1 Kings":22,"2 Kings":25,"1 Chronicles":29,"2 Chronicles":36,
  Ezra:10,Nehemiah:13,Esther:10,Job:42,Psalms:150,Proverbs:31,
  Ecclesiastes:12,"Song of Solomon":8,Isaiah:66,Jeremiah:52,
  Lamentations:5,Ezekiel:48,Daniel:12,Hosea:14,Joel:3,Amos:9,
  Obadiah:1,Jonah:4,Micah:7,Nahum:3,Habakkuk:3,Zephaniah:3,
  Haggai:2,Zechariah:14,Malachi:4,
  Matthew:28,Mark:16,Luke:24,John:21,Acts:28,Romans:16,
  "1 Corinthians":16,"2 Corinthians":13,Galatians:6,Ephesians:6,
  Philippians:4,Colossians:4,"1 Thessalonians":5,"2 Thessalonians":3,
  "1 Timothy":6,"2 Timothy":4,Titus:3,Philemon:1,Hebrews:13,
  James:5,"1 Peter":5,"2 Peter":3,"1 John":5,"2 John":1,"3 John":1,
  Jude:1,Revelation:22,
};

function parseRefParts(ref: string): { book: string; chapter: number } | null {
  const m = ref.trim().match(/^((?:[1-3]\s+)?[A-Za-z][A-Za-z\s]*?)\s+(\d+)/);
  if (!m) return null;
  return { book: m[1].trim(), chapter: parseInt(m[2], 10) };
}

function navigateChapter(ref: string, delta: number): string | null {
  const parts = parseRefParts(ref);
  if (!parts) return null;
  const bookKey = Object.keys(BIBLE_CHAPTERS).find(
    (k) => k.toLowerCase() === parts.book.toLowerCase(),
  );
  if (!bookKey) return null;
  const next = parts.chapter + delta;
  if (next < 1 || next > BIBLE_CHAPTERS[bookKey]) return null;
  return `${bookKey} ${next}`;
}

function getBookSuggestions(input: string): string[] {
  const bookPart = input.replace(/\d.*/, "").trim();
  if (bookPart.length < 2) return [];
  return BIBLE_BOOKS.filter((b) =>
    b.toLowerCase().startsWith(bookPart.toLowerCase()),
  ).slice(0, 5);
}

/* ─── Types ─── */

type User = { id: string; name: string; email: string; language: string };
type UserGroup = { id: string; name: string; timezone: string; role: string; inviteToken: string | null };
type BootstrapPayload = { now: string; users: User[] };

type Snapshot = {
  group: {
    id: string; name: string; timezone: string;
    tiePolicy: "ADMIN_PICK" | "RANDOM" | "EARLIEST";
    liveTally: boolean; votingDurationHours: number;
    inviteToken: string | null;
  };
  week: {
    id: string; startDate: string; votingCloseAt: string;
    status: "VOTING_OPEN" | "RESOLVED" | "PENDING_MANUAL";
    resolvedReadingId: string | null;
  };
  members: Array<{ id: string; name: string; role: "OWNER" | "ADMIN" | "MEMBER"; language: string }>;
  proposals: Array<{
    id: string; reference: string; note: string; proposerId: string;
    proposerName: string; createdAt: string; voteCount: number; isSeed: boolean;
    voters: Array<{ id: string; name: string }>;
  }>;
  myRole: "OWNER" | "ADMIN" | "MEMBER";
  myVoteProposalId: string | null;
  readingItem: {
    id: string; reference: string; proposalId: string | null;
    note: string | null; proposerName: string | null;
  } | null;
  readMarks: Array<{ userId: string; status: "NOT_MARKED" | "PLANNED" | "READ" }>;
  history: Array<{
    weekId: string; startDate: string; reference: string;
    commentsCount: number; readCount: number;
  }>;
  pendingInvites: Array<{
    id: string; token: string; recipientName: string;
    recipientContact: string | null; createdBy: string;
    creatorName: string; createdAt: string;
  }>;
};

type Comment = {
  id: string; authorId: string; authorName: string; text: string;
  createdAt: string; updatedAt: string; canEdit: boolean; canDelete: boolean;
  replies: Array<{
    id: string; authorId: string; authorName: string; text: string;
    createdAt: string; updatedAt: string; canEdit: boolean; canDelete: boolean;
  }>;
};

type NotificationItem = {
  id: string; type: string; text: string;
  metadata: Record<string, unknown>; createdAt: string; readAt: string | null;
};

type BibleVerse = { verse: number; text: string };
type BibleText = {
  reference: string;
  verses: BibleVerse[];
  text: string;
  translation: string;
};

type AnnotationReply = {
  id: string; authorId: string; authorName: string;
  text: string; createdAt: string; canDelete: boolean;
};

type Annotation = {
  id: string; authorId: string; authorName: string;
  startVerse: number; endVerse: number;
  text: string; createdAt: string; canDelete: boolean;
  replies: AnnotationReply[];
};

/* ─── Icons (inline SVG) ─── */

function IconMenu() {
  return <svg viewBox="0 0 24 24"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>;
}
function IconX() {
  return <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}
function IconVote() {
  return <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" /></svg>;
}
function IconBook() {
  return <svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>;
}
function IconClock() {
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" /></svg>;
}
function IconUsers() {
  return <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>;
}
function IconCheck() {
  return <svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }}><polyline points="20,6 9,17 4,12" /></svg>;
}
function IconPlus() {
  return <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
function IconSeed() {
  return <svg viewBox="0 0 24 24" style={{ width: 12, height: 12 }}><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 4a2 2 0 110 4 2 2 0 010-4zm0 14c-2.67 0-8-1.34-8-4v-2c0-2.66 5.33-4 8-4s8 1.34 8 4v2c0 2.66-5.33 4-8 4z" /></svg>;
}

/* ─── Helpers ─── */

const COLOR_POOL = ["#4A6741", "#8B6914", "#6B4984", "#2D6A8F", "#8F452D", "#4D6A9A", "#8A5A44"];

function toDateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function relativeTime(value: string): string {
  const ms = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getAvatar(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

function colorFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) hash += userId.charCodeAt(i);
  return COLOR_POOL[Math.abs(hash) % COLOR_POOL.length];
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (response.status === 401) {
    window.location.href = "/api/auth/signin";
    throw new Error("Session expired");
  }
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload;
}

function voteDurationLabel(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  if (rem === 0) return `${days} day${days > 1 ? "s" : ""}`;
  return `${days}d ${rem}h`;
}

/* ─── Main Component ─── */

export default function Home() {
  const { data: session, status: sessionStatus } = useSession();
  const selectedUserId = session?.user?.id ?? "";

  const [tab, setTab] = useState<"vote" | "reading" | "history" | "squad">("vote");
  const [groupId, setGroupId] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [membershipError, setMembershipError] = useState("");

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Proposal form
  const [showPropose, setShowPropose] = useState(false);
  const [newReference, setNewReference] = useState("");
  const [newNote, setNewNote] = useState("");

  // Comment
  const [newComment, setNewComment] = useState("");
  const [replyOpenCommentId, setReplyOpenCommentId] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  // Groups
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // Invite
  const [joinToken, setJoinToken] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteContact, setInviteContact] = useState("");

  // Bible text
  const [bibleText, setBibleText] = useState<BibleText | null>(null);
  const [bibleLoading, setBibleLoading] = useState(false);
  // Reader navigation
  const [readerReference, setReaderReference] = useState<string | null>(null);
  // Autocomplete
  const [bookSuggestions, setBookSuggestions] = useState<string[]>([]);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Proposal previews (#13)
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});
  const [previewTexts, setPreviewTexts] = useState<Record<string, BibleText | null>>({});
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({});

  // Annotations (verse highlights)
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedVerses, setSelectedVerses] = useState<{ start: number; end: number } | null>(null);
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(null);
  const [annotationText, setAnnotationText] = useState("");
  const [annotationReplyText, setAnnotationReplyText] = useState("");
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [bottomSheetMode, setBottomSheetMode] = useState<"new" | "view">("new");
  const versesRef = useRef<HTMLDivElement>(null);

  // Settings
  const [showSettings, setShowSettings] = useState(false);

  // Admin login (hidden)
  const [brandTaps, setBrandTaps] = useState(0);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [adminError, setAdminError] = useState("");

  /* ─── Derived ─── */

  const selectedUser = session?.user ?? null;

  const daysLeft = useMemo(() => {
    if (!snapshot) return 0;
    const delta = new Date(snapshot.week.votingCloseAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(delta / (24 * 60 * 60 * 1000)));
  }, [snapshot]);

  const totalVotes = useMemo(
    () => snapshot?.proposals.reduce((acc, p) => acc + p.voteCount, 0) ?? 0,
    [snapshot?.proposals],
  );

  const myReadStatus = useMemo(() => {
    if (!snapshot || !selectedUserId) return "NOT_MARKED";
    return snapshot.readMarks.find((m) => m.userId === selectedUserId)?.status ?? "NOT_MARKED";
  }, [selectedUserId, snapshot]);

  const isAdmin = snapshot?.myRole === "OWNER" || snapshot?.myRole === "ADMIN";

  // Build a map of verse -> annotations for highlight rendering
  const verseAnnotationMap = useMemo(() => {
    const map: Record<number, Annotation[]> = {};
    for (const ann of annotations) {
      for (let v = ann.startVerse; v <= ann.endVerse; v++) {
        if (!map[v]) map[v] = [];
        map[v].push(ann);
      }
    }
    return map;
  }, [annotations]);

  /* ─── Data loading ─── */

  async function loadBibleText(reference: string) {
    setBibleLoading(true);
    try {
      const data = await api<BibleText>(`/api/bible?reference=${encodeURIComponent(reference)}`);
      setBibleText(data);
    } catch {
      setBibleText(null);
    } finally {
      setBibleLoading(false);
    }
  }

  function openInReader(reference: string) {
    setReaderReference(reference);
    setTab("reading");
    void loadBibleText(reference);
  }

  function goToWeekReading() {
    setReaderReference(null);
    if (snapshot?.readingItem) void loadBibleText(snapshot.readingItem.reference);
  }

  function navigateReader(delta: number) {
    const current = readerReference ?? snapshot?.readingItem?.reference;
    if (!current) return;
    const next = navigateChapter(current, delta);
    if (next) openInReader(next);
  }

  async function loadProposalPreview(proposalId: string, reference: string) {
    if (previewTexts[proposalId] !== undefined) return;
    setPreviewLoading((prev) => ({ ...prev, [proposalId]: true }));
    try {
      const data = await api<BibleText>(`/api/bible?reference=${encodeURIComponent(reference)}`);
      setPreviewTexts((prev) => ({ ...prev, [proposalId]: data }));
    } catch {
      setPreviewTexts((prev) => ({ ...prev, [proposalId]: null }));
    } finally {
      setPreviewLoading((prev) => ({ ...prev, [proposalId]: false }));
    }
  }

  function togglePreview(proposalId: string, reference: string) {
    const isOpen = !previewOpen[proposalId];
    setPreviewOpen((prev) => ({ ...prev, [proposalId]: isOpen }));
    if (isOpen) loadProposalPreview(proposalId, reference);
  }

  async function loadSnapshot(gId: string) {
    const payload = await api<Snapshot>(`/api/groups/${gId}/active-week`);
    setSnapshot(payload);
    setInviteToken(payload.group.inviteToken ?? "");

    if (payload.readingItem) {
      const [c, a] = await Promise.all([
        api<{ comments: Comment[] }>(
          `/api/reading-items/${payload.readingItem.id}/comments`,
        ),
        api<{ annotations: Annotation[] }>(
          `/api/reading-items/${payload.readingItem.id}/annotations`,
        ),
        loadBibleText(payload.readingItem.reference),
      ]);
      setComments(c.comments);
      setAnnotations(a.annotations);
    } else {
      setComments([]);
      setAnnotations([]);
      setBibleText(null);
    }

    const n = await api<{ notifications: NotificationItem[] }>(`/api/users/me/notifications`);
    setNotifications(n.notifications);
  }

  async function loadUserGroups(): Promise<UserGroup[]> {
    const payload = await api<{ groups: UserGroup[] }>(`/api/users/me/groups`);
    setUserGroups(payload.groups);
    return payload.groups;
  }

  async function refreshData(group = groupId) {
    if (!group) return;
    try {
      setError("");
      setMembershipError("");
      await loadSnapshot(group);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to refresh";
      if (message.toLowerCase().includes("not a member")) {
        setMembershipError(message);
        setSnapshot(null);
      } else {
        setError(message);
      }
    }
  }

  /* ─── Bootstrap ─── */

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session?.user?.id) return;

    void (async () => {
      try {
        await api<BootstrapPayload>("/api/bootstrap");

        const groups = await loadUserGroups();
        const savedGroupId = window.localStorage.getItem("bible-app-group-id") ?? "";
        const initialGroupId = groups.some((g) => g.id === savedGroupId) ? savedGroupId : groups[0]?.id ?? "";
        setGroupId(initialGroupId);
        if (initialGroupId) {
          window.localStorage.setItem("bible-app-group-id", initialGroupId);
          await loadSnapshot(initialGroupId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load app");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, session?.user?.id]);

  // Draft persistence
  useEffect(() => {
    if (!selectedUserId || !snapshot?.readingItem) return;
    const key = `bible-app-draft:${snapshot.readingItem.id}:${selectedUserId}`;
    setNewComment(window.localStorage.getItem(key) ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, snapshot?.readingItem?.id]);

  useEffect(() => {
    if (!selectedUserId || !snapshot?.readingItem) return;
    const key = `bible-app-draft:${snapshot.readingItem.id}:${selectedUserId}`;
    window.localStorage.setItem(key, newComment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newComment, selectedUserId, snapshot?.readingItem?.id]);

  /* ─── Verse selection detection ─── */

  const handleVerseSelection = useCallback(() => {
    if (bottomSheetOpen && bottomSheetMode === "view") return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const container = versesRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) return;

    // Find verse spans in the selection
    const verseSpans = container.querySelectorAll<HTMLSpanElement>("[data-verse]");
    let startVerse: number | null = null;
    let endVerse: number | null = null;

    for (const span of verseSpans) {
      if (sel.containsNode(span, true)) {
        const v = parseInt(span.dataset.verse!, 10);
        if (startVerse === null || v < startVerse) startVerse = v;
        if (endVerse === null || v > endVerse) endVerse = v;
      }
    }

    if (startVerse !== null && endVerse !== null) {
      setSelectedVerses({ start: startVerse, end: endVerse });
      setBottomSheetMode("new");
      setAnnotationText("");
      setBottomSheetOpen(true);
      sel.removeAllRanges();
    }
  }, [bottomSheetOpen, bottomSheetMode]);

  useEffect(() => {
    const onMouseUp = () => setTimeout(handleVerseSelection, 10);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchend", onMouseUp);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchend", onMouseUp);
    };
  }, [handleVerseSelection]);

  function closeBottomSheet() {
    setBottomSheetOpen(false);
    setActiveAnnotation(null);
    setSelectedVerses(null);
    setAnnotationText("");
    setAnnotationReplyText("");
  }

  function onClickHighlight(ann: Annotation) {
    setActiveAnnotation(ann);
    setBottomSheetMode("view");
    setAnnotationReplyText("");
    setBottomSheetOpen(true);
  }

  async function loadAnnotations() {
    if (!snapshot?.readingItem) return;
    try {
      const a = await api<{ annotations: Annotation[] }>(
        `/api/reading-items/${snapshot.readingItem.id}/annotations`,
      );
      setAnnotations(a.annotations);
    } catch { /* ignore */ }
  }

  function onCreateAnnotation() {
    if (!selectedVerses || !annotationText.trim() || !snapshot?.readingItem) return;
    void (async () => {
      try {
        setSubmitting(true);
        await api(`/api/reading-items/${snapshot.readingItem!.id}/annotations`, {
          method: "POST",
          body: JSON.stringify({
            startVerse: selectedVerses.start,
            endVerse: selectedVerses.end,
            text: annotationText.trim(),
          }),
        });
        closeBottomSheet();
        await loadAnnotations();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create annotation");
      } finally {
        setSubmitting(false);
      }
    })();
  }

  function onCreateAnnotationReply() {
    if (!activeAnnotation || !annotationReplyText.trim()) return;
    void (async () => {
      try {
        setSubmitting(true);
        await api(`/api/annotations/${activeAnnotation.id}/replies`, {
          method: "POST",
          body: JSON.stringify({ text: annotationReplyText.trim() }),
        });
        setAnnotationReplyText("");
        await loadAnnotations();
        // Refresh the active annotation
        const updated = await api<{ annotations: Annotation[] }>(
          `/api/reading-items/${snapshot!.readingItem!.id}/annotations`,
        );
        setAnnotations(updated.annotations);
        const refreshed = updated.annotations.find((a) => a.id === activeAnnotation.id);
        if (refreshed) setActiveAnnotation(refreshed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to post reply");
      } finally {
        setSubmitting(false);
      }
    })();
  }

  function onDeleteAnnotation(annotationId: string) {
    void (async () => {
      try {
        setSubmitting(true);
        await api(`/api/annotations/${annotationId}`, { method: "DELETE" });
        closeBottomSheet();
        await loadAnnotations();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete");
      } finally {
        setSubmitting(false);
      }
    })();
  }

  function onDeleteAnnotationReply(replyId: string) {
    void (async () => {
      try {
        setSubmitting(true);
        await api(`/api/annotation-replies/${replyId}`, { method: "DELETE" });
        await loadAnnotations();
        if (activeAnnotation) {
          const updated = await api<{ annotations: Annotation[] }>(
            `/api/reading-items/${snapshot!.readingItem!.id}/annotations`,
          );
          setAnnotations(updated.annotations);
          const refreshed = updated.annotations.find((a) => a.id === activeAnnotation.id);
          if (refreshed) setActiveAnnotation(refreshed);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete reply");
      } finally {
        setSubmitting(false);
      }
    })();
  }

  /* ─── Auth ─── */

  function onSignOut() {
    window.localStorage.removeItem("bible-app-group-id");
    void signOut();
  }

  /* ─── Actions ─── */

  async function mutate(action: () => Promise<void>) {
    try {
      setSubmitting(true);
      setError("");
      await action();
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  function onChangeGroup(newGId: string) {
    setGroupId(newGId);
    window.localStorage.setItem("bible-app-group-id", newGId);
    void refreshData(newGId);
  }

  function onVote(proposalId: string) {
    if (!groupId || !selectedUserId) return;
    // Optimistic UI: update vote immediately
    setSnapshot((prev) => {
      if (!prev) return prev;
      const userName = prev.members.find((m) => m.id === selectedUserId)?.name ?? "";
      return {
        ...prev,
        myVoteProposalId: proposalId,
        proposals: prev.proposals.map((p) => {
          const hadMyVote = prev.myVoteProposalId === p.id;
          const getsMyVote = p.id === proposalId;
          const newVoters = hadMyVote
            ? p.voters.filter((v) => v.id !== selectedUserId)
            : p.voters;
          return {
            ...p,
            voteCount: p.voteCount + (getsMyVote ? 1 : 0) - (hadMyVote ? 1 : 0),
            voters: getsMyVote ? [...newVoters, { id: selectedUserId, name: userName }] : newVoters,
          };
        }),
      };
    });
    void (async () => {
      try {
        setSubmitting(true);
        const result = await api<{ ok: boolean; autoResolved?: boolean }>(`/api/groups/${groupId}/vote`, {
          method: "POST",
          body: JSON.stringify({ proposalId }),
        });
        if (result.autoResolved) {
          setTab("reading");
        }
        await refreshData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Vote failed");
        await refreshData(); // Revert optimistic update
      } finally {
        setSubmitting(false);
      }
    })();
  }

  function onCreateProposal() {
    if (!groupId || !selectedUserId || !newReference.trim()) return;
    void mutate(async () => {
      await api(`/api/groups/${groupId}/proposals`, {
        method: "POST",
        body: JSON.stringify({ reference: newReference, note: newNote }),
      });
      setNewReference("");
      setNewNote("");
      setShowPropose(false);
    });
  }

  function onResolve(proposalId?: string) {
    if (!groupId || !selectedUserId) return;
    void mutate(async () => {
      await api(`/api/groups/${groupId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ proposalId }),
      });
    });
  }

  function onReadMark(status: "NOT_MARKED" | "PLANNED" | "READ") {
    if (!selectedUserId || !snapshot?.readingItem) return;
    void mutate(async () => {
      await api(`/api/reading-items/${snapshot!.readingItem!.id}/read-mark`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
    });
  }

  function onCreateComment(parentId?: string) {
    if (!selectedUserId || !snapshot?.readingItem) return;
    const text = parentId ? replyDrafts[parentId] ?? "" : newComment;
    if (!text.trim()) return;
    void mutate(async () => {
      await api(`/api/reading-items/${snapshot.readingItem?.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ text, parentId }),
      });
      if (parentId) {
        setReplyDrafts((prev) => ({ ...prev, [parentId]: "" }));
        setReplyOpenCommentId("");
      } else {
        setNewComment("");
      }
    });
  }

  function onDeleteComment(commentId: string) {
    if (!selectedUserId) return;
    void mutate(async () => {
      await api(`/api/comments/${commentId}`, {
        method: "DELETE",
        body: JSON.stringify({}),
      });
    });
  }

  function onJoinInvite() {
    if (!joinToken.trim() || !selectedUserId) return;
    void (async () => {
      try {
        setSubmitting(true);
        setError("");
        const payload = await api<{ groupId: string }>(`/api/invites/${encodeURIComponent(joinToken.trim())}/join`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        setGroupId(payload.groupId);
        window.localStorage.setItem("bible-app-group-id", payload.groupId);
        setMembershipError("");
        await loadUserGroups();
        await loadSnapshot(payload.groupId);
        setDrawerOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to join group");
      } finally {
        setSubmitting(false);
      }
    })();
  }

  function onCreateGroup() {
    if (!newGroupName.trim() || !selectedUserId) return;
    void (async () => {
      try {
        setSubmitting(true);
        setError("");
        const payload = await api<{ groupId: string }>("/api/groups", {
          method: "POST",
          body: JSON.stringify({
            name: newGroupName.trim(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
        setNewGroupName("");
        setShowCreateGroup(false);
        setGroupId(payload.groupId);
        window.localStorage.setItem("bible-app-group-id", payload.groupId);
        await loadUserGroups();
        await loadSnapshot(payload.groupId);
        setDrawerOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create group");
      } finally {
        setSubmitting(false);
      }
    })();
  }

  function onCreateInvite() {
    if (!groupId || !selectedUserId) return;
    void mutate(async () => {
      const payload = await api<{ token: string }>(`/api/groups/${groupId}/invites`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setInviteToken(payload.token);
    });
  }

  function onSendInvite() {
    if (!groupId || !selectedUserId || !inviteName.trim()) return;
    void (async () => {
      try {
        setSubmitting(true);
        setError("");
        const payload = await api<{ token: string }>(`/api/groups/${groupId}/invites`, {
          method: "POST",
          body: JSON.stringify({
            recipientName: inviteName.trim(),
            recipientContact: inviteContact.trim() || undefined,
          }),
        });
        setInviteName("");
        setInviteContact("");
        setShowInviteForm(false);

        const inviteUrl = `${window.location.origin}/invite/${payload.token}`;
        const shareText = `Hey${inviteName.trim() ? ` ${inviteName.trim()}` : ""}! Join my Bible reading group on Bible Vote: ${inviteUrl}`;

        // Try Web Share API first (mobile), then fall back to clipboard
        if (navigator.share) {
          try {
            await navigator.share({ title: "Bible Vote Invite", text: shareText });
          } catch {
            // User cancelled share — still copy to clipboard
            await navigator.clipboard.writeText(inviteUrl);
          }
        } else {
          await navigator.clipboard.writeText(inviteUrl);
          alert("Invite link copied to clipboard!");
        }

        await refreshData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create invite");
      } finally {
        setSubmitting(false);
      }
    })();
  }

  function onCancelInvite(inviteId: string) {
    if (!groupId || !selectedUserId) return;
    void mutate(async () => {
      await api(`/api/groups/${groupId}/invites`, {
        method: "DELETE",
        body: JSON.stringify({ inviteId }),
      });
    });
  }

  function onShareInviteLink(token: string, recipientName: string) {
    const inviteUrl = `${window.location.origin}/invite/${token}`;
    const shareText = `Hey ${recipientName}! Join my Bible reading group on Bible Vote: ${inviteUrl}`;

    if (navigator.share) {
      void navigator.share({ title: "Bible Vote Invite", text: shareText }).catch(() => {
        void navigator.clipboard.writeText(inviteUrl);
      });
    } else {
      void navigator.clipboard.writeText(inviteUrl).then(() => {
        alert("Invite link copied to clipboard!");
      });
    }
  }

  function onReroll(proposalId: string) {
    if (!groupId || !selectedUserId) return;
    void mutate(async () => {
      await api(`/api/groups/${groupId}/proposals/reroll`, {
        method: "POST",
        body: JSON.stringify({ proposalId }),
      });
    });
  }

  function onStartNewVote() {
    if (!groupId || !selectedUserId) return;
    void mutate(async () => {
      await api(`/api/groups/${groupId}/new-vote`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setTab("vote");
    });
  }

  function onUpdateSettings(field: string, value: unknown) {
    if (!groupId || !selectedUserId) return;
    void mutate(async () => {
      await api(`/api/groups/${groupId}/settings`, {
        method: "PUT",
        body: JSON.stringify({ [field]: value }),
      });
    });
  }

  /* ─── Loading screen ─── */

  if (sessionStatus === "loading" || (session && loading)) {
    return (
      <div className="loading-screen">
        <span>Bible Vote</span>
      </div>
    );
  }

  /* ─── Auth screen ─── */

  if (!session) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div
            className="auth-brand"
            onClick={() => setBrandTaps((n) => n + 1)}
            style={{ cursor: "default", userSelect: "none" }}
          >
            Bible Vote
          </div>
          <div className="auth-subtitle">Vote on weekly Bible readings with your group</div>
          <button
            className="btn btn-gold auth-btn"
            onClick={() => void signIn("google")}
            style={{ marginTop: 24 }}
            type="button"
          >
            Sign in with Google
          </button>

          {brandTaps >= 5 && (
            <div className="stack" style={{ marginTop: 16 }}>
              <input
                className="auth-input"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="Email"
              />
              <input
                className="auth-input"
                type="password"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && adminEmail && adminPass) {
                    setAdminError("");
                    void signIn("admin", { email: adminEmail, password: adminPass, redirect: false }).then((res) => {
                      if (res?.error) setAdminError("Invalid credentials");
                    });
                  }
                }}
                placeholder="Password"
              />
              {adminError && <div className="auth-error">{adminError}</div>}
              <button
                className="btn btn-sm"
                onClick={() => {
                  setAdminError("");
                  void signIn("admin", { email: adminEmail, password: adminPass, redirect: false }).then((res) => {
                    if (res?.error) setAdminError("Invalid credentials");
                  });
                }}
                disabled={!adminEmail || !adminPass}
                type="button"
              >
                Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ─── Render ─── */

  return (
    <>
      {/* ── Top Bar ── */}
      <header className="topbar">
        <div className="topbar-brand">Bible Vote</div>
        <div className="topbar-group">{snapshot?.group.name ?? ""}</div>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={() => void refreshData()} type="button" disabled={submitting}>
            <svg viewBox="0 0 24 24"><polyline points="23,4 23,10 17,10" /><polyline points="1,20 1,14 7,14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
          </button>
          <button className="icon-btn" onClick={() => setDrawerOpen(true)} type="button">
            {notifications.length > 0 && <span className="notif-dot" />}
            <IconMenu />
          </button>
        </div>
      </header>

      {/* ── Drawer Backdrop ── */}
      <div
        className={`drawer-backdrop ${drawerOpen ? "open" : ""}`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* ── Drawer ── */}
      <aside className={`drawer ${drawerOpen ? "open" : ""}`}>
        <div className="drawer-header">
          <div className="drawer-title">Settings</div>
          <button className="icon-btn" onClick={() => setDrawerOpen(false)} type="button">
            <IconX />
          </button>
        </div>

        {/* Signed-in user */}
        <div className="drawer-section">
          <div className="drawer-label">Signed in as</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="avatar" style={{ background: colorFor(selectedUserId) }}>
              {getAvatar(selectedUser?.name ?? "?")}
            </span>
            <div>
              <div style={{ fontWeight: 500 }}>{session?.user?.name ?? "Unknown"}</div>
              <div className="text-tertiary" style={{ fontSize: 12 }}>{session?.user?.email ?? ""}</div>
            </div>
          </div>
          <button
            className="btn btn-sm"
            style={{ marginTop: 12, width: "100%" }}
            onClick={onSignOut}
            type="button"
          >
            Sign Out
          </button>
        </div>

        {/* Group switcher */}
        <div className="drawer-section">
          <div className="drawer-label">Group</div>
          {userGroups.length > 0 ? (
            <select
              className="drawer-select"
              value={groupId}
              onChange={(e) => { onChangeGroup(e.target.value); }}
            >
              {userGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          ) : (
            <div className="text-tertiary" style={{ fontSize: 13 }}>No groups yet</div>
          )}
          {!showCreateGroup ? (
            <button
              className="btn btn-sm"
              style={{ marginTop: 10, width: "100%" }}
              onClick={() => setShowCreateGroup(true)}
              type="button"
              disabled={!selectedUserId}
            >
              <IconPlus /> Create Group
            </button>
          ) : (
            <div className="drawer-row" style={{ flexDirection: "column", gap: 8 }}>
              <input
                className="drawer-input"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name"
              />
              <div className="drawer-row">
                <button className="btn btn-gold btn-sm" style={{ flex: 1 }} onClick={onCreateGroup} type="button" disabled={submitting || !newGroupName.trim()}>
                  Create
                </button>
                <button className="btn btn-sm" onClick={() => setShowCreateGroup(false)} type="button">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Invite */}
        <div className="drawer-section">
          <div className="drawer-label">Join a Group</div>
          <div className="drawer-row" style={{ marginTop: 0 }}>
            <input
              className="drawer-input"
              value={joinToken}
              onChange={(e) => setJoinToken(e.target.value)}
              placeholder="Paste invite token"
              style={{ flex: 1 }}
            />
            <button className="btn btn-gold btn-sm" onClick={onJoinInvite} type="button" disabled={submitting || !selectedUserId || !joinToken.trim()}>
              Join
            </button>
          </div>

          {snapshot && (
            <>
              <div className="drawer-label" style={{ marginTop: 16 }}>Share Invite</div>
              {inviteToken ? (
                <div className="invite-display">
                  <code>{inviteToken}</code>
                </div>
              ) : (
                <div className="text-tertiary" style={{ fontSize: 13 }}>No active invite</div>
              )}
              <button
                className="btn btn-sm"
                style={{ marginTop: 8, width: "100%" }}
                onClick={onCreateInvite}
                type="button"
                disabled={!isAdmin || submitting}
              >
                Generate New Token
              </button>
            </>
          )}
        </div>

        {/* Group Settings (admin only) */}
        {snapshot && isAdmin && (
          <div className="drawer-section">
            <div className="drawer-label" style={{ cursor: "pointer" }} onClick={() => setShowSettings((s) => !s)}>
              Group Settings {showSettings ? "\u25B2" : "\u25BC"}
            </div>
            {showSettings && (
              <div className="stack-sm" style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Vote Duration: {voteDurationLabel(snapshot.group.votingDurationHours)}
                </div>
                <select
                  className="drawer-select"
                  value={snapshot.group.votingDurationHours}
                  onChange={(e) => onUpdateSettings("votingDurationHours", Number(e.target.value))}
                >
                  <option value={24}>24 hours (1 day)</option>
                  <option value={48}>48 hours (2 days)</option>
                  <option value={68}>68 hours (Mon-Wed 8pm, default)</option>
                  <option value={72}>72 hours (3 days)</option>
                  <option value={96}>96 hours (4 days)</option>
                  <option value={120}>120 hours (5 days)</option>
                  <option value={144}>144 hours (6 days)</option>
                  <option value={168}>168 hours (full week)</option>
                </select>

                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
                  Tie-Breaking Policy
                </div>
                <select
                  className="drawer-select"
                  value={snapshot.group.tiePolicy}
                  onChange={(e) => onUpdateSettings("tiePolicy", e.target.value)}
                >
                  <option value="ADMIN_PICK">Admin picks winner</option>
                  <option value="RANDOM">Random selection</option>
                  <option value="EARLIEST">Earliest proposal wins</option>
                </select>

                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
                  Show Live Vote Tally
                </div>
                <select
                  className="drawer-select"
                  value={snapshot.group.liveTally ? "true" : "false"}
                  onChange={(e) => onUpdateSettings("liveTally", e.target.value === "true")}
                >
                  <option value="true">Yes</option>
                  <option value="false">No (hidden until close)</option>
                </select>
              </div>
            )}
          </div>
        )}

        {/* Notifications */}
        <div className="drawer-section">
          <div className="drawer-label">Notifications ({notifications.length})</div>
          {notifications.length === 0 ? (
            <div className="text-tertiary" style={{ fontSize: 13 }}>No notifications yet</div>
          ) : (
            notifications.slice(0, 15).map((item) => (
              <div key={item.id} className="drawer-notif">
                <div className="drawer-notif-text">{item.text}</div>
                <div className="drawer-notif-time">{relativeTime(item.createdAt)}</div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Tab Bar ── */}
      <nav className="tab-bar">
        <button className={`tab-item ${tab === "vote" ? "active" : ""}`} onClick={() => setTab("vote")} type="button">
          <IconVote />
          <span className="tab-label">Vote</span>
        </button>
        <button className={`tab-item ${tab === "reading" ? "active" : ""}`} onClick={() => setTab("reading")} type="button">
          <IconBook />
          <span className="tab-label">Read</span>
        </button>
        <button className={`tab-item ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")} type="button">
          <IconClock />
          <span className="tab-label">History</span>
        </button>
        <button className={`tab-item ${tab === "squad" ? "active" : ""}`} onClick={() => setTab("squad")} type="button">
          <IconUsers />
          <span className="tab-label">Squad</span>
        </button>
      </nav>

      {/* ── Content ── */}
      <main className="content-area">
        {error && <div className="notice notice-error">{error}</div>}

        {membershipError && !snapshot && (
          <div className="card stack fade-in">
            <div className="section-title">Join a Group</div>
            <div className="text-muted">You&apos;re not in this group yet. Use an invite token to join.</div>
            <div className="row">
              <input
                className="input"
                value={joinToken}
                onChange={(e) => setJoinToken(e.target.value)}
                placeholder="Invite token"
                style={{ flex: 1 }}
              />
              <button className="btn btn-gold" onClick={onJoinInvite} type="button">Join</button>
            </div>
          </div>
        )}

        {!snapshot && !membershipError && !error && (
          <div className="empty fade-in">
            <svg className="empty-icon" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>
            <div>Select or create a group to get started.</div>
            <button className="btn btn-gold" style={{ marginTop: 16 }} onClick={() => setDrawerOpen(true)} type="button">Open Menu</button>
          </div>
        )}

        {snapshot && (
          <>
            {/* ── VOTE TAB ── */}
            {tab === "vote" && (
              <section className="stack fade-in">
                <div className="row-between">
                  <div>
                    <div className="section-title">This Week&apos;s Vote</div>
                    <div className="section-sub">
                      Closes {toDateLabel(snapshot.week.votingCloseAt)} &middot; {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                    </div>
                  </div>
                  <span className="badge badge-gold">{totalVotes} votes</span>
                </div>

                {snapshot.week.status === "PENDING_MANUAL" && (
                  <div className="notice">Voting closed without an automatic winner. Admin must resolve.</div>
                )}

                {snapshot.proposals.length === 0 && (
                  <div className="empty">
                    <svg className="empty-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /></svg>
                    No proposals yet. Add one to start the week.
                  </div>
                )}

                <div className="stack">
                  {snapshot.proposals.map((p) => (
                    <div key={p.id} className={`proposal ${snapshot.myVoteProposalId === p.id ? "voted" : ""}`}>
                      <div className="row-between" style={{ alignItems: "flex-start" }}>
                        <div>
                          <div className="proposal-ref">
                            {p.reference}
                            {p.isSeed && <span className="seed-badge"><IconSeed /> suggested</span>}
                          </div>
                          {p.note && <div className="proposal-note">{p.note}</div>}
                          <div className="proposal-meta">
                            {p.isSeed ? "System suggestion" : `Proposed by ${p.proposerName}`}
                            {p.voters.length > 0 && (
                              <> &middot; Votes: {p.voters.map((v) => v.name).join(", ")}</>
                            )}
                          </div>
                        </div>
                        <div className="vote-count">
                          {snapshot.group.liveTally || snapshot.week.status === "RESOLVED"
                            ? p.voteCount
                            : "\u2022"}
                        </div>
                      </div>
                      <div className="proposal-actions">
                        <button
                          className={`btn ${snapshot.myVoteProposalId === p.id ? "btn-gold" : ""}`}
                          onClick={() => onVote(p.id)}
                          disabled={submitting || snapshot.week.status !== "VOTING_OPEN" || daysLeft <= 0}
                          type="button"
                        >
                          {snapshot.myVoteProposalId === p.id && <IconCheck />}
                          {snapshot.myVoteProposalId === p.id ? "Voted" : "Vote"}
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => togglePreview(p.id, p.reference)}
                          type="button"
                        >
                          {previewOpen[p.id] ? "Hide" : "Preview"}
                        </button>
                        {(isAdmin || p.proposerId === selectedUserId) && !p.isSeed && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => void mutate(async () => {
                              await api(`/api/groups/${groupId}/proposals`, {
                                method: "DELETE",
                                body: JSON.stringify({ proposalId: p.id }),
                              });
                            })}
                            disabled={submitting}
                            type="button"
                          >
                            Remove
                          </button>
                        )}
                        {isAdmin && p.isSeed && (
                          <button
                            className="btn btn-sm"
                            onClick={() => onReroll(p.id)}
                            disabled={submitting}
                            type="button"
                          >
                            Reroll
                          </button>
                        )}
                        {isAdmin && snapshot.week.status === "PENDING_MANUAL" && (
                          <button className="btn btn-gold btn-sm" onClick={() => onResolve(p.id)} disabled={submitting} type="button">
                            Pick Winner
                          </button>
                        )}
                      </div>

                      {/* Passage preview */}
                      {previewOpen[p.id] && (
                        <div className="proposal-preview">
                          {previewLoading[p.id] && (
                            <div className="bible-loading">Loading passage...</div>
                          )}
                          {previewTexts[p.id] && previewTexts[p.id]!.verses.length > 0 && (
                            <div className="bible-text-container" style={{ borderTop: "none", paddingTop: 0, marginTop: 0 }}>
                              <div className="bible-translation">{previewTexts[p.id]!.translation}</div>
                              <div className="bible-verses" style={{ fontSize: 15, lineHeight: 1.65 }}>
                                {previewTexts[p.id]!.verses.map((v) => (
                                  <span key={v.verse} className="bible-verse">
                                    <sup className="verse-num">{v.verse}</sup>
                                    {v.text}{" "}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {!previewLoading[p.id] && previewTexts[p.id] === null && (
                            <div className="text-tertiary" style={{ fontSize: 12, padding: "8px 0" }}>
                              Could not load passage text.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Propose form */}
                {snapshot.week.status === "VOTING_OPEN" && daysLeft > 0 && (
                  <>
                    {!showPropose ? (
                      <button
                        className="btn"
                        onClick={() => setShowPropose(true)}
                        type="button"
                      >
                        <IconPlus /> Propose passage
                      </button>
                    ) : (
                      <div className="card stack">
                        <div className="passage-helper">
                          <div className="passage-helper-title">Passage size guide</div>
                          <div className="passage-helper-text">
                            Aim for 15-40 verses (about 5-10 min read). A single chapter or a focused section works well.
                            Format: <strong>Book Chapter:Start-End</strong> (e.g. John 3:1-21, Psalm 23, Romans 8:18-39)
                          </div>
                        </div>
                        <div className="reference-input-wrap" ref={autocompleteRef}>
                          <input
                            className="input"
                            value={newReference}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNewReference(val);
                              setBookSuggestions(getBookSuggestions(val));
                            }}
                            onBlur={() => setTimeout(() => setBookSuggestions([]), 150)}
                            placeholder="Reference (e.g. John 3:1-21)"
                          />
                          {bookSuggestions.length > 0 && (
                            <div className="autocomplete-dropdown">
                              {bookSuggestions.map((b) => (
                                <button
                                  key={b}
                                  type="button"
                                  className="autocomplete-item"
                                  onMouseDown={() => {
                                    const rest = newReference.replace(/^[^0-9]*/, "");
                                    setNewReference(rest ? `${b} ${rest}` : `${b} `);
                                    setBookSuggestions([]);
                                  }}
                                >
                                  {b}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {isValidReference(newReference) && (
                          <button
                            type="button"
                            className="btn btn-sm read-it-btn"
                            onClick={() => openInReader(newReference)}
                          >
                            Read it
                          </button>
                        )}
                        <textarea
                          className="textarea"
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          maxLength={240}
                          placeholder="Why this passage this week?"
                        />
                        <div className="row">
                          <button className="btn btn-gold" onClick={onCreateProposal} type="button" disabled={submitting}>Submit</button>
                          <button className="btn" onClick={() => setShowPropose(false)} type="button">Cancel</button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Admin resolve + New vote */}
                {isAdmin && snapshot.week.status !== "RESOLVED" && (
                  <button
                    className="btn btn-sm"
                    onClick={() => onResolve()}
                    disabled={submitting}
                    type="button"
                  >
                    Resolve Now (Admin)
                  </button>
                )}

                {snapshot.week.status === "RESOLVED" && (
                  <div className="card stack" style={{ textAlign: "center" }}>
                    <div className="text-muted">
                      This week&apos;s vote is resolved. {snapshot.readingItem ? `Reading: ${snapshot.readingItem.reference}` : ""}
                    </div>
                    <button
                      className="btn btn-gold"
                      onClick={onStartNewVote}
                      disabled={submitting}
                      type="button"
                    >
                      Start New Vote
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* ── READING TAB ── */}
            {tab === "reading" && (
              <section className="stack fade-in">
                {!snapshot.readingItem && !readerReference ? (
                  <div className="empty">
                    <svg className="empty-icon" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>
                    Waiting for the vote to resolve. Discussion opens once a passage is selected.
                  </div>
                ) : (
                  <>
                    {/* Back to week's reading */}
                    {readerReference && snapshot.readingItem && readerReference !== snapshot.readingItem.reference && (
                      <button
                        type="button"
                        className="btn btn-sm reader-back-btn"
                        onClick={goToWeekReading}
                      >
                        ← Back to this week&apos;s reading ({snapshot.readingItem.reference})
                      </button>
                    )}

                    {/* Reading card */}
                    <div className="card stack">
                      {!readerReference && snapshot.readingItem && (
                        <>
                          <div className="text-tertiary" style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 }}>
                            Week of {toDateLabel(snapshot.week.startDate)}
                          </div>
                          {snapshot.readingItem.note && <div className="text-muted">{snapshot.readingItem.note}</div>}
                          {snapshot.readingItem.proposerName && (
                            <div className="text-tertiary" style={{ fontSize: 12 }}>Proposed by {snapshot.readingItem.proposerName}</div>
                          )}
                        </>
                      )}
                      <div className="section-title">
                        {readerReference ?? snapshot.readingItem?.reference}
                      </div>

                      {/* Bible Text */}
                      {bibleLoading && (
                        <div className="bible-loading">Loading passage...</div>
                      )}
                      {bibleText && bibleText.verses.length > 0 && (
                        <div className="bible-text-container">
                          <div className="bible-translation">{bibleText.translation}</div>
                          <div className="bible-verses" ref={versesRef}>
                            {bibleText.verses.map((v) => {
                              const anns = verseAnnotationMap[v.verse];
                              const isHighlighted = anns && anns.length > 0;
                              const highlightColor = isHighlighted ? colorFor(anns[0].authorId) : undefined;
                              return (
                                <span
                                  key={v.verse}
                                  data-verse={v.verse}
                                  className={`bible-verse${isHighlighted ? " verse-highlighted" : ""}`}
                                  style={isHighlighted ? { "--hl-color": highlightColor } as React.CSSProperties : undefined}
                                  onClick={isHighlighted ? (e) => {
                                    e.stopPropagation();
                                    onClickHighlight(anns[0]);
                                  } : undefined}
                                >
                                  <sup className="verse-num">{v.verse}</sup>
                                  {v.text}{" "}
                                </span>
                              );
                            })}
                          </div>
                          {annotations.length > 0 && (
                            <div className="annotation-hint">
                              {annotations.length} highlight{annotations.length !== 1 ? "s" : ""} in this passage
                            </div>
                          )}
                        </div>
                      )}
                      {!bibleLoading && bibleText === null && (
                        <button
                          className="btn btn-sm"
                          onClick={() => loadBibleText(readerReference ?? snapshot.readingItem!.reference)}
                          type="button"
                        >
                          Load passage text
                        </button>
                      )}

                      {/* Chapter navigation */}
                      {(() => {
                        const cur = readerReference ?? snapshot.readingItem?.reference ?? "";
                        const prevRef = navigateChapter(cur, -1);
                        const nextRef = navigateChapter(cur, 1);
                        if (!prevRef && !nextRef) return null;
                        return (
                          <div className="chapter-nav">
                            <button
                              type="button"
                              className="btn btn-sm chapter-nav-btn"
                              onClick={() => navigateReader(-1)}
                              disabled={!prevRef}
                            >
                              ← {prevRef ?? ""}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm chapter-nav-btn"
                              onClick={() => navigateReader(1)}
                              disabled={!nextRef}
                            >
                              {nextRef ?? ""} →
                            </button>
                          </div>
                        );
                      })()}

                      {/* Read status + member statuses — only for week's assigned reading */}
                      {!readerReference && snapshot.readingItem && (
                        <>
                          <div className="read-pills">
                            <button
                              className={`read-pill ${myReadStatus === "NOT_MARKED" ? "active" : ""}`}
                              onClick={() => onReadMark("NOT_MARKED")}
                              type="button"
                            >
                              Not Read
                            </button>
                            <button
                              className={`read-pill ${myReadStatus === "PLANNED" ? "active" : ""}`}
                              onClick={() => onReadMark("PLANNED")}
                              type="button"
                            >
                              Planned
                            </button>
                            <button
                              className={`read-pill ${myReadStatus === "READ" ? "active-ok" : ""}`}
                              onClick={() => onReadMark("READ")}
                              type="button"
                            >
                              Read
                            </button>
                          </div>

                          <div>
                            {snapshot.members.map((m) => {
                              const st = snapshot.readMarks.find((rm) => rm.userId === m.id)?.status ?? "NOT_MARKED";
                              return (
                                <div key={m.id} className="member-status">
                                  <span className="avatar avatar-sm" style={{ background: colorFor(m.id) }}>{getAvatar(m.name)}</span>
                                  <span className="member-status-name">{m.name}</span>
                                  <span className={`status-dot ${st === "READ" ? "read" : st === "PLANNED" ? "planned" : ""}`} />
                                  <span className="text-tertiary" style={{ fontSize: 11, minWidth: 50, textAlign: "right" }}>
                                    {st === "NOT_MARKED" ? "none" : st.toLowerCase()}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Discussion */}
                    <div className="card stack">
                      <div className="row-between">
                        <div className="section-title" style={{ fontSize: 20 }}>Discussion</div>
                        <span className="text-tertiary" style={{ fontSize: 12 }}>{comments.length} comments</span>
                      </div>

                      <div className="stack-sm">
                        <textarea
                          className="textarea"
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value.slice(0, 500))}
                          placeholder="Share a reflection..."
                          maxLength={500}
                          style={{ minHeight: 64 }}
                        />
                        <div className="row-between">
                          <span className="text-tertiary" style={{ fontSize: 11 }}>{newComment.length}/500</span>
                          <button
                            className="btn btn-gold btn-sm"
                            onClick={() => onCreateComment()}
                            disabled={submitting || !newComment.trim()}
                            type="button"
                          >
                            Post
                          </button>
                        </div>
                      </div>

                      {comments.length === 0 && <div className="text-tertiary" style={{ textAlign: "center", padding: 16 }}>No comments yet. Be the first to share.</div>}

                      <div>
                        {comments.map((c) => (
                          <div key={c.id} className="comment">
                            <div className="row-between">
                              <span className="comment-author">{c.authorName}</span>
                              <span className="comment-time">{relativeTime(c.createdAt)}</span>
                            </div>
                            <div className="comment-text">{c.text}</div>
                            <div className="comment-actions">
                              <button
                                className="btn-link"
                                onClick={() => setReplyOpenCommentId((cur) => (cur === c.id ? "" : c.id))}
                                type="button"
                              >
                                Reply ({c.replies.length})
                              </button>
                              {c.canDelete && (
                                <button className="btn-link" onClick={() => onDeleteComment(c.id)} type="button">Delete</button>
                              )}
                            </div>

                            {replyOpenCommentId === c.id && (
                              <div className="stack-sm" style={{ marginTop: 10 }}>
                                <input
                                  className="input"
                                  value={replyDrafts[c.id] ?? ""}
                                  onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [c.id]: e.target.value.slice(0, 500) }))}
                                  placeholder="Write a reply..."
                                />
                                <div className="row">
                                  <button className="btn btn-gold btn-sm" onClick={() => onCreateComment(c.id)} type="button" disabled={submitting || !(replyDrafts[c.id] ?? "").trim()}>
                                    Send
                                  </button>
                                  <button className="btn btn-sm" onClick={() => setReplyOpenCommentId("")} type="button">Cancel</button>
                                </div>
                              </div>
                            )}

                            {c.replies.map((r) => (
                              <div key={r.id} className="reply">
                                <div className="row-between">
                                  <span className="comment-author">{r.authorName}</span>
                                  <span className="comment-time">{relativeTime(r.createdAt)}</span>
                                </div>
                                <div className="comment-text">{r.text}</div>
                                {r.canDelete && (
                                  <div className="comment-actions">
                                    <button className="btn-link" onClick={() => onDeleteComment(r.id)} type="button">Delete</button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}

            {/* ── HISTORY TAB ── */}
            {tab === "history" && (
              <section className="stack fade-in">
                <div className="section-title">Past Readings</div>
                {snapshot.history.length === 0 && (
                  <div className="empty">
                    <svg className="empty-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" /></svg>
                    No archived weeks yet.
                  </div>
                )}
                {snapshot.history.map((item) => (
                  <div key={item.weekId} className="history-item">
                    <div>
                      <div className="history-ref">{item.reference}</div>
                      <div className="history-meta">Week of {toDateLabel(item.startDate)}</div>
                    </div>
                    <div className="history-stats">
                      <div>{item.commentsCount} comments</div>
                      <div>{item.readCount} read</div>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* ── SQUAD TAB ── */}
            {tab === "squad" && (
              <section className="stack fade-in">
                <div className="section-title">Squad</div>

                <div className="stat-grid">
                  <div className="stat-card">
                    <div className="stat-label">Members</div>
                    <div className="stat-value">{snapshot.members.length}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Votes</div>
                    <div className="stat-value">{totalVotes}</div>
                  </div>
                </div>

                <div className="stack">
                  {snapshot.members.map((m) => {
                    const proposed = snapshot.proposals.filter((p) => p.proposerId === m.id && !p.isSeed).length;
                    const voted = snapshot.proposals.filter((p) => p.voters.some((v) => v.id === m.id)).length;
                    const readSt = snapshot.readMarks.find((rm) => rm.userId === m.id)?.status ?? "NOT_MARKED";
                    return (
                      <div key={m.id} className="member-card">
                        <span className="avatar" style={{ background: colorFor(m.id) }}>{getAvatar(m.name)}</span>
                        <div className="member-info">
                          <div className="member-name">{m.name}</div>
                          <div className="member-role">{m.role} &middot; {m.language}</div>
                        </div>
                        <div className="member-stats">
                          <div>Proposals: {proposed}</div>
                          <div>Voted: {voted > 0 ? "yes" : "no"}</div>
                          <div>Read: {readSt === "READ" ? "yes" : readSt === "PLANNED" ? "planned" : "no"}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pending Invites */}
                {snapshot.pendingInvites.length > 0 && (
                  <div className="card stack">
                    <div className="section-title" style={{ fontSize: 16 }}>Pending Invites</div>
                    {snapshot.pendingInvites.map((inv) => (
                      <div key={inv.id} className="pending-invite">
                        <div className="pending-invite-info">
                          <span className="avatar avatar-sm pending-avatar">{getAvatar(inv.recipientName)}</span>
                          <div>
                            <div className="pending-invite-name">{inv.recipientName}</div>
                            <div className="pending-invite-meta">
                              {inv.recipientContact && <span>{inv.recipientContact} &middot; </span>}
                              Invited by {inv.creatorName} &middot; {relativeTime(inv.createdAt)}
                            </div>
                          </div>
                        </div>
                        <div className="pending-invite-actions">
                          <button
                            className="btn btn-sm"
                            onClick={() => onShareInviteLink(inv.token, inv.recipientName)}
                            type="button"
                          >
                            Resend
                          </button>
                          {(inv.createdBy === selectedUserId || isAdmin) && (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => onCancelInvite(inv.id)}
                              disabled={submitting}
                              type="button"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Invite a Friend */}
                {!showInviteForm ? (
                  <button
                    className="btn btn-gold invite-friend-btn"
                    onClick={() => setShowInviteForm(true)}
                    type="button"
                  >
                    <IconPlus /> Invite a Friend
                  </button>
                ) : (
                  <div className="card stack">
                    <div className="section-title" style={{ fontSize: 16 }}>Invite a Friend</div>
                    <input
                      className="input"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Friend's name"
                      maxLength={80}
                    />
                    <input
                      className="input"
                      value={inviteContact}
                      onChange={(e) => setInviteContact(e.target.value)}
                      placeholder="Email or phone (optional)"
                    />
                    <div className="row">
                      <button
                        className="btn btn-gold"
                        onClick={onSendInvite}
                        type="button"
                        disabled={submitting || !inviteName.trim()}
                      >
                        Create &amp; Share Link
                      </button>
                      <button className="btn" onClick={() => setShowInviteForm(false)} type="button">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        <div className="text-tertiary" style={{ fontSize: 11, textAlign: "center", paddingTop: 8 }}>
          Signed in as {session?.user?.name ?? "Unknown"}
        </div>
      </main>

      {/* ── Annotation Bottom Sheet ── */}
      {bottomSheetOpen && (
        <>
          <div className="sheet-backdrop" onClick={closeBottomSheet} />
          <div className="sheet">
            <div className="sheet-handle" />

            {bottomSheetMode === "new" && selectedVerses && (
              <div className="sheet-content">
                <div className="sheet-header">
                  <div className="sheet-title">
                    Comment on {selectedVerses.start === selectedVerses.end
                      ? `verse ${selectedVerses.start}`
                      : `verses ${selectedVerses.start}\u2013${selectedVerses.end}`}
                  </div>
                  <button className="icon-btn" onClick={closeBottomSheet} type="button">
                    <IconX />
                  </button>
                </div>
                <textarea
                  className="textarea"
                  value={annotationText}
                  onChange={(e) => setAnnotationText(e.target.value.slice(0, 500))}
                  placeholder="Share your thoughts on this passage..."
                  maxLength={500}
                  autoFocus
                  style={{ minHeight: 80 }}
                />
                <div className="row-between">
                  <span className="text-tertiary" style={{ fontSize: 11 }}>{annotationText.length}/500</span>
                  <button
                    className="btn btn-gold"
                    onClick={onCreateAnnotation}
                    disabled={submitting || !annotationText.trim()}
                    type="button"
                  >
                    Highlight &amp; Comment
                  </button>
                </div>
              </div>
            )}

            {bottomSheetMode === "view" && activeAnnotation && (
              <div className="sheet-content">
                <div className="sheet-header">
                  <div className="sheet-title">
                    {activeAnnotation.startVerse === activeAnnotation.endVerse
                      ? `Verse ${activeAnnotation.startVerse}`
                      : `Verses ${activeAnnotation.startVerse}\u2013${activeAnnotation.endVerse}`}
                  </div>
                  <button className="icon-btn" onClick={closeBottomSheet} type="button">
                    <IconX />
                  </button>
                </div>

                {/* Original annotation */}
                <div className="sheet-annotation">
                  <div className="sheet-annotation-header">
                    <span className="avatar avatar-sm" style={{ background: colorFor(activeAnnotation.authorId) }}>
                      {getAvatar(activeAnnotation.authorName)}
                    </span>
                    <div>
                      <div className="sheet-annotation-author">{activeAnnotation.authorName}</div>
                      <div className="sheet-annotation-time">{relativeTime(activeAnnotation.createdAt)}</div>
                    </div>
                    {activeAnnotation.canDelete && (
                      <button
                        className="btn-link"
                        style={{ marginLeft: "auto" }}
                        onClick={() => onDeleteAnnotation(activeAnnotation.id)}
                        type="button"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <div className="sheet-annotation-text">{activeAnnotation.text}</div>
                </div>

                {/* Replies */}
                {activeAnnotation.replies.length > 0 && (
                  <div className="sheet-replies">
                    {activeAnnotation.replies.map((r) => (
                      <div key={r.id} className="sheet-reply">
                        <div className="sheet-annotation-header">
                          <span className="avatar avatar-sm" style={{ background: colorFor(r.authorId) }}>
                            {getAvatar(r.authorName)}
                          </span>
                          <div>
                            <div className="sheet-annotation-author">{r.authorName}</div>
                            <div className="sheet-annotation-time">{relativeTime(r.createdAt)}</div>
                          </div>
                          {r.canDelete && (
                            <button
                              className="btn-link"
                              style={{ marginLeft: "auto" }}
                              onClick={() => onDeleteAnnotationReply(r.id)}
                              type="button"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                        <div className="sheet-reply-text">{r.text}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply input */}
                <div className="sheet-reply-input">
                  <input
                    className="input"
                    value={annotationReplyText}
                    onChange={(e) => setAnnotationReplyText(e.target.value.slice(0, 500))}
                    placeholder="Add a reply..."
                    maxLength={500}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && annotationReplyText.trim()) {
                        e.preventDefault();
                        onCreateAnnotationReply();
                      }
                    }}
                  />
                  <button
                    className="btn btn-gold btn-sm"
                    onClick={onCreateAnnotationReply}
                    disabled={submitting || !annotationReplyText.trim()}
                    type="button"
                  >
                    Reply
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
