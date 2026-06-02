import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, onActiveAgencyChange } from '../utils/api';
import { SkeletonStats, SkeletonTable } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import {
  Users, UserCheck, UserX, LayoutDashboard, History,
  MessageCircle, Mail, Copy, Phone, ChevronDown, ChevronUp, MoreHorizontal,
  Plus, Upload, Trash2, Check, Send, AlertCircle, X, Search,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { buildWhatsAppLink, buildMailtoLink, getTravelerQrLink, buildShareMessage } from '../utils/share';
import GroupMembersEditor, { emptyMember, validateMembers } from '../components/GroupMembersEditor';

const FILTERS = {
  all: { label: 'Toutes les personnes', color: 'var(--text-primary)', icon: Users },
  checked_in: { label: 'Embarqués', color: 'var(--success-light)', icon: UserCheck },
  remaining: { label: 'Restants', color: 'var(--warning-light)', icon: UserX },
};

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}

const EMPTY_FORM = {
  firstName: '', lastName: '', type: 'person',
  peopleCount: 1, peopleCountInput: '1',
  notes: '', phone: '', email: '',
  groupMembers: [],
};

const PERSON_NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿĀ-žḀ-ỿ'’\- ]{2,50}$/u;
const PHONE_RE = /^\+?[\d][\d\s.\-]{7,18}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NOTES_UI = 500;

function validateTravelerForm({ firstName, lastName, phone, email, notes }) {
  const fn = (firstName || '').trim();
  const ln = (lastName || '').trim();
  if (!fn || !PERSON_NAME_RE.test(fn)) return 'Le prénom contient des caractères non autorisés ou est invalide (2 à 50 caractères).';
  if (!ln || !PERSON_NAME_RE.test(ln)) return 'Le nom contient des caractères non autorisés ou est invalide (2 à 50 caractères).';
  if (phone) {
    const p = phone.trim();
    const digits = p.replace(/\D/g, '');
    if (!PHONE_RE.test(p) || digits.length < 8 || digits.length > 15) {
      return 'Numéro de téléphone invalide.';
    }
  }
  if (email) {
    const e = email.trim().toLowerCase();
    if (e.length > 120 || !EMAIL_RE.test(e)) return 'Email invalide.';
  }
  if (notes && notes.length > MAX_NOTES_UI) return `Les notes ne doivent pas dépasser ${MAX_NOTES_UI} caractères.`;
  return null;
}

export default function Dashboard({ tripId, lastMessage, trip }) {
  const [stats, setStats] = useState(null);
  const [travelers, setTravelers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [shareMode, setShareMode] = useState(null); // null | 'whatsapp' | 'email'
  const isMobile = useIsMobile();
  const [activityOpen, setActivityOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [travelersOpen, setTravelersOpen] = useState(true);
  const navigate = useNavigate();

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!tripId) return;
    if (isRefresh) setRefreshing(true);
    try {
      const [statsData, travelersData, eventsData] = await Promise.all([
        api.getStats(tripId),
        api.getTravelers(tripId),
        api.getEvents(10, tripId),
      ]);
      setStats(statsData);
      setTravelers(travelersData);
      setEvents(eventsData);
    } catch (e) {
      console.error('Failed to fetch dashboard data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tripId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (lastMessage && (lastMessage.type === 'check_in' || lastMessage.type === 'undo_check_in')) {
      fetchData();
    }
  }, [lastMessage, fetchData]);

  // Clear selection on filter change, trip change, or agency switch.
  useEffect(() => { setSelectedIds(new Set()); }, [filter]);
  useEffect(() => { setSelectedIds(new Set()); }, [search]);
  useEffect(() => { setSelectedIds(new Set()); setSearch(''); }, [tripId]);
  useEffect(() => {
    const off = onActiveAgencyChange(() => setSelectedIds(new Set()));
    return off;
  }, []);

  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2400);
  }, []);

  const copyText = useCallback(async (text, label) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      showToast(label || 'Copié');
    } catch { showToast('Copie impossible'); }
  }, [showToast]);

  const filteredTravelers = useMemo(() => {
    let list = travelers;
    if (filter === 'remaining') list = list.filter(t => t.status === 'not_checked_in');
    else if (filter === 'checked_in') list = list.filter(t => t.status === 'checked_in');
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(t =>
        (t.displayName || '').toLowerCase().includes(q) ||
        (t.phone || '').toLowerCase().includes(q) ||
        (t.email || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [travelers, filter, search]);

  const visibleIds = useMemo(() => filteredTravelers.map(t => t.id), [filteredTravelers]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const selectedTravelers = useMemo(
    () => travelers.filter(t => selectedIds.has(t.id)),
    [travelers, selectedIds]
  );

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const selectAllVisible = useCallback(() => setSelectedIds(new Set(visibleIds)), [visibleIds]);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ─── Optimistic helpers ─────────────────────────────────────────
  // Flip one traveler's status in place (new object only for that row, so
  // memoized BoardRows for unchanged rows don't re-render).
  const setTravelerStatus = useCallback((id, status) => {
    setTravelers(prev => prev.map(t => (
      t.id === id
        ? { ...t, status, checkedInAt: status === 'checked_in' ? new Date().toISOString() : null }
        : t
    )));
  }, []);
  // Move `deltaPeople` head-count and `deltaUnits` rows between the
  // Embarqués / Restants counters (the hero shows the *people* totals).
  const adjustStats = useCallback((deltaPeople, deltaUnits) => {
    setStats(s => (s ? {
      ...s,
      checkedInPeople: Math.max(0, (s.checkedInPeople || 0) + deltaPeople),
      checkedInUnits: Math.max(0, (s.checkedInUnits || 0) + deltaUnits),
      missingPeople: Math.max(0, (s.missingPeople || 0) - deltaPeople),
      missingUnits: Math.max(0, (s.missingUnits || 0) - deltaUnits),
    } : s));
  }, []);

  // ─── Check-in / Undo (optimistic) ───────────────────────────────
  // Update local state immediately, fire the API in the background, and
  // roll back just that row + counters on failure. No blocking refetch.
  const handleCheckIn = useCallback(async (t) => {
    if (t.status === 'checked_in') return;
    const n = t.peopleCount || 1;
    const optimEvent = { id: `optim-${t.id}-${Date.now()}`, referenceCode: t.referenceCode, action: 'check_in', timestamp: new Date().toISOString() };
    setTravelerStatus(t.id, 'checked_in');
    adjustStats(n, 1);
    setEvents(ev => [optimEvent, ...ev].slice(0, 10));
    showToast(`${t.displayName} embarqué(e)`);
    try {
      await api.manualCheckIn(t.id, tripId);
    } catch (e) {
      setTravelerStatus(t.id, 'not_checked_in');
      adjustStats(-n, -1);
      setEvents(ev => ev.filter(x => x.id !== optimEvent.id));
      showToast(e.message || 'Erreur lors de l\'embarquement');
    }
  }, [tripId, setTravelerStatus, adjustStats, showToast]);

  const handleUndo = useCallback(async (t) => {
    if (t.status !== 'checked_in') return;
    const n = t.peopleCount || 1;
    const optimEvent = { id: `optim-${t.id}-${Date.now()}`, referenceCode: t.referenceCode, action: 'undo_check_in', timestamp: new Date().toISOString() };
    setTravelerStatus(t.id, 'not_checked_in');
    adjustStats(-n, -1);
    setEvents(ev => [optimEvent, ...ev].slice(0, 10));
    showToast(`${t.displayName} dés-embarqué(e)`);
    try {
      await api.undoCheckIn(t.referenceCode, tripId);
    } catch (e) {
      setTravelerStatus(t.id, 'checked_in');
      adjustStats(n, 1);
      setEvents(ev => ev.filter(x => x.id !== optimEvent.id));
      showToast(e.message || 'Erreur lors du dés-embarquement');
    }
  }, [tripId, setTravelerStatus, adjustStats, showToast]);

  // ─── Bulk check-in / undo (optimistic + silent reconcile) ───────
  // Apply locally for instantly-eligible rows, call the API, then refetch
  // silently in the background to reconcile any server-side skips. On error
  // we restore the pre-action snapshot of the affected rows.
  const handleBulkCheckIn = useCallback(async () => {
    const targets = selectedTravelers.filter(t => t.status === 'not_checked_in');
    if (targets.length === 0) return;
    const ids = targets.map(t => t.id);
    const people = targets.reduce((sum, t) => sum + (t.peopleCount || 1), 0);
    setTravelers(prev => prev.map(t => (ids.includes(t.id) ? { ...t, status: 'checked_in', checkedInAt: new Date().toISOString() } : t)));
    adjustStats(people, ids.length);
    clearSelection();
    try {
      const r = await api.bulkManualCheckIn(ids, tripId);
      const skipped = ids.length - r.updated;
      showToast(skipped > 0
        ? `${r.updated} voyageur(s) embarqué(s), ${skipped} ignoré(s)`
        : `${r.updated} voyageur(s) embarqué(s)`);
      fetchData(); // silent reconcile (no spinner, UI already updated)
    } catch (e) {
      setTravelers(prev => prev.map(t => (ids.includes(t.id) ? { ...t, status: 'not_checked_in', checkedInAt: null } : t)));
      adjustStats(-people, -ids.length);
      showToast(e.message || 'Erreur lors de l\'embarquement');
    }
  }, [selectedTravelers, tripId, adjustStats, clearSelection, showToast, fetchData]);

  const handleBulkUndo = useCallback(async () => {
    const targets = selectedTravelers.filter(t => t.status === 'checked_in');
    if (targets.length === 0) return;
    const ids = targets.map(t => t.id);
    const people = targets.reduce((sum, t) => sum + (t.peopleCount || 1), 0);
    setTravelers(prev => prev.map(t => (ids.includes(t.id) ? { ...t, status: 'not_checked_in', checkedInAt: null } : t)));
    adjustStats(-people, -ids.length);
    clearSelection();
    try {
      const r = await api.bulkUndoCheckIn(ids, tripId);
      const skipped = ids.length - r.updated;
      showToast(skipped > 0
        ? `${r.updated} voyageur(s) désembarqué(s), ${skipped} ignoré(s)`
        : `${r.updated} voyageur(s) désembarqué(s)`);
      fetchData(); // silent reconcile
    } catch (e) {
      setTravelers(prev => prev.map(t => (ids.includes(t.id) ? { ...t, status: 'checked_in', checkedInAt: new Date().toISOString() } : t)));
      adjustStats(people, ids.length);
      showToast(e.message || 'Erreur lors du désembarquement');
    }
  }, [selectedTravelers, tripId, adjustStats, clearSelection, showToast, fetchData]);

  // ─── Bulk delete ────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const result = await api.bulkDeleteTravelers(ids);
      showToast(`${result.deleted} voyageur(s) supprimé(s)`);
      clearSelection();
      setShowDeleteConfirm(false);
      fetchData(true);
    } catch (e) {
      showToast(e.message || 'Erreur lors de la suppression');
    } finally {
      setBulkDeleting(false);
    }
  };

  const goToTraveler = useCallback((id) => navigate(`/travelers/${id}`), [navigate]);

  // ───────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────

  if (!tripId) {
    return (
      <div style={{ marginTop: '48px' }}>
        <EmptyState
          icon={LayoutDashboard}
          title="Aucun voyage sélectionné"
          description="Sélectionnez un voyage dans le menu ou créez-en un nouveau pour voir les statistiques."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title"><LayoutDashboard size={28} className="text-accent" /> Tableau de bord</h1>
            <p className="page-subtitle">Chargement des données...</p>
          </div>
        </div>
        <SkeletonStats />
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonTable rows={3} />
          <SkeletonTable rows={3} />
        </div>
      </div>
    );
  }

  const current = FILTERS[filter];
  const CurrentIcon = current.icon;
  const agencyName = trip?.agencyName;
  const selectionCount = selectedIds.size;

  return (
    <div>
      {/* Trip Hero — boarding-pass-style active trip card */}
      {stats && (
        <TripHero
          trip={trip}
          stats={stats}
          onAddTravelers={() => setShowAdd(true)}
        />
      )}

      {/* Travelers — collapsible (same design as Activité récente) */}
      <div className="glass-card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setTravelersOpen(v => !v)}
            aria-expanded={travelersOpen}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <h2 className="glass-card-title" style={{ margin: 0 }}>
              <Users size={20} /> Voyageurs
            </h2>
            {travelersOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

      {travelersOpen && (<>
        <div className="toolbar" style={{ marginTop: '12px' }}>
          <div className="toolbar__search">
            <Search size={16} className="toolbar__search-icon" />
            <input
              type="text"
              className="input-search"
              placeholder="Rechercher par nom, téléphone ou email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Rechercher un voyageur"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Effacer la recherche"
                className="toolbar__search-clear"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="seg" role="tablist" aria-label="Filtrer la liste">
            {Object.entries(FILTERS).map(([k, f]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={filter === k}
                onClick={() => setFilter(k)}
              >
                {f.label === 'Toutes les personnes' ? 'Toutes' : f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Selection bar — always visible while accordion is open */}
        <SelectionBar
          count={selectionCount}
          selectedTravelers={selectedTravelers}
          onClear={clearSelection}
          onDelete={() => setShowDeleteConfirm(true)}
          onShareWhatsApp={() => setShareMode('whatsapp')}
          onShareEmail={() => setShareMode('email')}
          onBulkCheckIn={handleBulkCheckIn}
          onBulkUndo={handleBulkUndo}
          isMobile={isMobile}
        />

        {filteredTravelers.length === 0 ? (
          search.trim() ? (
            <EmptyState
              icon={Search}
              title="Aucun voyageur trouvé"
              description={`Aucun résultat pour « ${search.trim()} ».`}
            />
          ) : (
          <EmptyState
            icon={current.icon}
            title={filter === 'remaining' ? 'Tout le monde est là !' : filter === 'checked_in' ? 'Aucun embarquement' : 'Aucun voyageur'}
            description={
              filter === 'remaining'
                ? 'Tous les voyageurs de ce voyage ont embarqué.'
                : filter === 'checked_in'
                  ? "Personne n'a encore embarqué."
                  : 'Cliquez sur « Ajouter des voyageurs » pour commencer.'
            }
          />)
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 4px 10px' }}>
              <input
                id="dashboard-select-all"
                type="checkbox"
                aria-label="Tout sélectionner"
                checked={allVisibleSelected}
                onChange={() => allVisibleSelected ? clearSelection() : selectAllVisible()}
              />
              <label htmlFor="dashboard-select-all" style={{ fontSize: '0.82rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                {allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
              </label>
            </div>
            <ul className="board-list">
              {filteredTravelers.map(t => (
                <BoardRow
                  key={t.id}
                  traveler={t}
                  trip={trip}
                  agencyName={agencyName}
                  checked={selectedIds.has(t.id)}
                  onSelect={toggleSelect}
                  onOpen={goToTraveler}
                  onCheckIn={handleCheckIn}
                  onUndo={handleUndo}
                  onCopy={copyText}
                />
              ))}
            </ul>
          </>
        )}
      </>)}
      </div>

      {/* Recent Activity — collapsible */}
      <div className="glass-card">
        <button
          type="button"
          onClick={() => setActivityOpen(v => !v)}
          aria-expanded={activityOpen}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <h2 className="glass-card-title" style={{ margin: 0 }}>
            <History size={20} /> Activité récente {events.length > 0 ? `(${events.length})` : ''}
          </h2>
          {activityOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {activityOpen && (
          events.length === 0 ? (
            <div style={{ marginTop: '12px' }}>
              <EmptyState
                icon={History}
                title="Aucune activité"
                description="Les scans apparaîtront ici en temps réel."
              />
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
              {events.map(event => {
                const traveler = travelers.find(t => t.referenceCode === event.referenceCode);
                const name = traveler ? traveler.displayName : event.referenceCode;
                const time = new Date(event.timestamp).toLocaleTimeString('fr-FR');
                const isCheckin = event.action === 'check_in';
                return (
                  <li key={event.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '16px',
                    padding: '12px 0', borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{
                      marginTop: '4px', width: '10px', height: '10px', borderRadius: '50%',
                      background: isCheckin ? 'var(--success)' : 'var(--warning)',
                      boxShadow: isCheckin ? '0 0 8px var(--success)' : 'none',
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        <strong>{name}</strong> a été {isCheckin ? 'embarqué(e)' : 'dés-embarqué(e)'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{time}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>

      {/* Add travelers modal */}
      <AddTravelersModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        tripId={tripId}
        onDone={(msg) => { showToast(msg); fetchData(true); }}
      />

      {/* Bulk delete confirm */}
      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(open) => { if (!open && !bulkDeleting) setShowDeleteConfirm(false); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{`Supprimer ${selectionCount} voyageur(s) ?`}</DialogTitle>
            <DialogDescription>
              Cette action est irréversible. Les voyageurs sélectionnés et leurs scans seront supprimés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={bulkDeleting}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
            >
              <Trash2 /> {bulkDeleting ? 'Suppression...' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk share modal */}
      <BulkShareModal
        isOpen={shareMode !== null}
        mode={shareMode}
        onClose={() => setShareMode(null)}
        travelers={selectedTravelers}
        trip={trip}
        agencyName={agencyName}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="dashboard-toast"
        >
          {toast}
        </div>
      )}

    </div>
  );
}

// ─── Trip Hero (compact header — no progress bar) ──────────────────
function TripHero({ trip, stats, onAddTravelers }) {
  const total = stats.totalPeople || 0;
  const done = stats.checkedInPeople || 0;
  const left = stats.missingPeople || 0;
  return (
    <section className="trip-hero trip-hero--compact" aria-label="Voyage actif">
      <div className="trip-hero__body">
        <div className="trip-hero__left">
          <div className="trip-hero__title-row">
            <div className="trip-hero__title">{trip?.name || 'Voyage'}</div>
            {trip?.date && (
              <span className="trip-hero__date">
                <Calendar size={12} /> {trip.date}
              </span>
            )}
          </div>
          {trip?.agencyName && (
            <div className="trip-hero__meta">
              <span>{trip.agencyName}</span>
            </div>
          )}
        </div>
      </div>
      <div className="capsule-row" role="group" aria-label="Statistiques voyage">
        <span className="capsule">
          <span className="capsule__label">Total</span>
          <span className="capsule__value">{total}</span>
        </span>
        <span className="capsule capsule--success">
          <span className="capsule__label">Embarqués</span>
          <span className="capsule__value">{done}</span>
        </span>
        <span className="capsule capsule--warning">
          <span className="capsule__label">Restants</span>
          <span className="capsule__value">{left}</span>
        </span>
        <button
          type="button"
          className="compact-add-button"
          onClick={onAddTravelers}
          aria-label="Ajouter des voyageurs"
          title="Ajouter des voyageurs"
        >
          <Plus size={20} />
        </button>
      </div>
    </section>
  );
}

// ─── Boarding-style traveler row ───────────────────────────────────
function BoardRowImpl({ traveler: t, trip, agencyName, checked, onSelect, onOpen, onCheckIn, onUndo, onCopy }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef(null);
  const isCheckedIn = t.status === 'checked_in';

  // Build the share links only while the menu is open — these used to run
  // for every row on every render (string building + URL encoding).
  const { qrLink, wa, mt } = useMemo(() => {
    if (!menuOpen) return { qrLink: null, wa: null, mt: null };
    const link = getTravelerQrLink(t.referenceCode);
    return {
      qrLink: link,
      wa: buildWhatsAppLink({ traveler: t, trip, qrLink: link, agencyName }),
      mt: buildMailtoLink({ traveler: t, trip, qrLink: link, agencyName }),
    };
  }, [menuOpen, t, trip, agencyName]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  const stop = (e) => e.stopPropagation();
  return (
    <li
      ref={rootRef}
      className={`board-row${checked ? ' board-row--selected' : ''}`}
      data-status={t.status}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(t.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(t.id); } }}
    >
      <div className="board-row__check" onClick={stop}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onSelect(t.id)}
          aria-label={`Sélectionner ${t.displayName}`}
        />
      </div>
      <div className="board-row__main">
        <div className="board-row__name">{t.displayName}</div>
        {t.peopleCount > 1 && (
          <div className="board-row__sub">
            <span className="board-row__people"><Users size={10} /> {t.peopleCount}</span>
          </div>
        )}
      </div>
      {isCheckedIn ? (
        <button
          type="button"
          className="board-row__action board-row__action--checked"
          onClick={(e) => { stop(e); onUndo(t); }}
          aria-label={`Désembarquer ${t.displayName}`}
          title={`Désembarquer ${t.displayName}`}
        >
          <Check size={18} />
        </button>
      ) : (
        <button
          type="button"
          className="board-row__action board-row__action--remaining"
          onClick={(e) => { stop(e); onCheckIn(t); }}
          aria-label={`Embarquer ${t.displayName}`}
          title={`Embarquer ${t.displayName}`}
        >
          <X size={18} />
        </button>
      )}
      <div style={{ position: 'relative' }} onClick={stop}>
        <button
          type="button"
          className="board-row__more"
          onClick={(e) => { stop(e); setMenuOpen(v => !v); }}
          aria-label={`Plus d'actions pour ${t.displayName}`}
          aria-expanded={menuOpen}
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && (
          <div className="popover" role="menu">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>
                <MessageCircle size={15} /> WhatsApp
              </a>
            )}
            {mt && (
              <a href={mt} onClick={() => setMenuOpen(false)}>
                <Mail size={15} /> Email
              </a>
            )}
            {t.phone && (
              <a href={`tel:${t.phone}`} onClick={() => setMenuOpen(false)}>
                <Phone size={15} /> Appeler
              </a>
            )}
            <button
              type="button"
              onClick={() => { setMenuOpen(false); if (qrLink) onCopy(qrLink, `Lien QR de ${t.displayName} copié`); }}
            >
              <Copy size={15} /> Copier le lien QR
            </button>
            <div className="popover__divider" />
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onOpen(t.id); }}
            >
              <LayoutDashboard size={15} /> Voir la fiche
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

// Memoized so toggling selection / checking in one row re-renders only the
// rows whose props actually changed, not the whole list.
const BoardRow = memo(BoardRowImpl);

// ─── Selection bar ─────────────────────────────────────────────────
function SelectionBar({ count, selectedTravelers, onClear, onDelete, onShareWhatsApp, onShareEmail, onBulkCheckIn, onBulkUndo, isMobile }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const hasPhone = selectedTravelers.some(t => t.phone);
  const hasEmail = selectedTravelers.some(t => t.email);
  const hasRemaining = selectedTravelers.some(t => t.status === 'not_checked_in');
  const hasCheckedIn = selectedTravelers.some(t => t.status === 'checked_in');

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e) => { if (!moreRef.current?.contains(e.target)) setMoreOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreOpen]);

  const hasSelection = count > 0;
  return (
    <div className="selection-bar--v2">
      <div className="sel-count">
        <span className={`sel-count__chip${hasSelection ? ' sel-count__chip--active' : ''}`}>
          {count}
        </span>
        <span className="sel-count__label">sélection</span>
        {hasSelection && (
          <button
            type="button"
            className="icon-btn sel-clear"
            onClick={onClear}
            aria-label="Tout désélectionner"
            title="Tout désélectionner"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {isMobile && (
        <div ref={moreRef} className="sel-more-wrap" style={{ position: 'relative' }}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMoreOpen(v => !v)}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label="Plus d'actions"
            title="Plus d'actions"
            disabled={!hasSelection}
            className="sel-more"
          >
            <MoreHorizontal />
          </Button>
          {moreOpen && (
            <div
              className="popover selection-more-menu"
              style={{ right: 0, left: 'auto', top: 'calc(100% + 6px)' }}
              role="menu"
            >
              <button type="button" disabled={!hasPhone} onClick={() => { setMoreOpen(false); onShareWhatsApp(); }}>
                <MessageCircle size={15} /> WhatsApp
              </button>
              <button type="button" disabled={!hasEmail} onClick={() => { setMoreOpen(false); onShareEmail(); }}>
                <Mail size={15} /> Email
              </button>
              <div className="popover__divider" />
              <button type="button" className="popover__danger" onClick={() => { setMoreOpen(false); onDelete(); }}>
                <Trash2 size={15} /> Supprimer
              </button>
            </div>
          )}
        </div>
      )}
      <div className="sel-actions">
        <Button
          size="sm"
          variant="outline"
          onClick={onBulkCheckIn}
          disabled={!hasRemaining}
          className="sel-action sel-action--checkin"
        >
          <Check /> Embarquer
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onBulkUndo}
          disabled={!hasCheckedIn}
          className="sel-action sel-action--undo"
        >
          <X /> Désembarquer
        </Button>
        {!isMobile && (
          <>
            <Button size="sm" variant="outline" onClick={onShareWhatsApp} disabled={!hasPhone} className="sel-action">
              <MessageCircle /> WhatsApp
            </Button>
            <Button size="sm" variant="outline" onClick={onShareEmail} disabled={!hasEmail} className="sel-action">
              <Mail /> Email
            </Button>
            <Button size="sm" variant="destructive" onClick={onDelete} disabled={!hasSelection} className="sel-action">
              <Trash2 /> Supprimer
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Add travelers modal (manual + CSV) ────────────────────────────
function AddTravelersModal({ isOpen, onClose, tripId, onDone }) {
  const [mode, setMode] = useState('manual');
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setMode('manual');
      setForm(EMPTY_FORM);
      setSubmitting(false);
      setError('');
      setImporting(false);
      setImportResult(null);
      setImportError('');
      setFileName('');
    }
  }, [isOpen]);

  const submitManual = async (e) => {
    e.preventDefault();
    setError('');
    const formErr = validateTravelerForm(form);
    if (formErr) { setError(formErr); return; }
    const isGroup = form.type === 'group';
    const peopleCount = isGroup ? Math.max(2, Number(form.peopleCount) || 2) : 1;
    if (isGroup) {
      const memberErr = validateMembers(form.groupMembers, peopleCount);
      if (memberErr) { setError(memberErr); return; }
    }
    setSubmitting(true);
    try {
      const firstName = form.firstName.trim();
      const lastName = form.lastName.trim();
      const payload = {
        firstName,
        lastName,
        type: form.type,
        tripId,
        peopleCount,
        phone: form.phone ? form.phone.trim() : undefined,
        email: form.email ? form.email.trim() : undefined,
        notes: form.notes ? form.notes.trim() : undefined,
        groupMembers: isGroup ? form.groupMembers : undefined,
      };
      await api.createTraveler(payload);
      onDone(`${firstName} ${lastName} ajouté(e)`);
      onClose();
    } catch (e) {
      setError(e.message || 'Erreur lors de l\'ajout');
    } finally {
      setSubmitting(false);
    }
  };

  const submitCsv = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setImportError('Sélectionnez un fichier CSV.'); return; }
    setImportError('');
    setImportResult(null);
    setImporting(true);
    try {
      const text = await file.text();
      const result = await api.importTravelersCsv(tripId, text);
      setImportResult(result);
      if (result.created > 0) onDone(`${result.created} voyageur(s) importé(s)`);
    } catch (e) {
      setImportError(e.message || 'Erreur lors de l\'import');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter des voyageurs</DialogTitle>
          <DialogDescription className="sr-only">
            Ajout manuel ou import CSV de voyageurs au voyage actif.
          </DialogDescription>
        </DialogHeader>
        <div role="tablist" aria-label="Mode d'ajout" className="add-mode-switch mb-4">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'manual'}
            className={`add-mode-switch__option${mode === 'manual' ? ' add-mode-switch__option--active' : ''}`}
            onClick={() => setMode('manual')}
          >
            <Plus size={16} /> Manuel
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'csv'}
            className={`add-mode-switch__option${mode === 'csv' ? ' add-mode-switch__option--active' : ''}`}
            onClick={() => setMode('csv')}
          >
            <Upload size={16} /> Import CSV
          </button>
        </div>

      {mode === 'manual' ? (
        <form onSubmit={submitManual} className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="add-first-name">Prénom *</Label>
              <Input
                id="add-first-name"
                required
                maxLength={50}
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-last-name">Nom *</Label>
              <Input
                id="add-last-name"
                required
                maxLength={50}
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="add-type">Type</Label>
              <Select
                value={form.type}
                onValueChange={(type) => {
                  // Individuel = 1; Groupe min = 2 (with 2 empty rows pre-filled).
                  const peopleCount = type === 'person' ? 1 : Math.max(2, form.peopleCount || 2);
                  const groupMembers = type === 'group'
                    ? (form.groupMembers?.length === peopleCount
                        ? form.groupMembers
                        : Array.from({ length: peopleCount }, () => emptyMember()))
                    : [];
                  setForm({
                    ...form,
                    type,
                    peopleCount,
                    peopleCountInput: String(peopleCount),
                    groupMembers,
                  });
                }}
              >
                <SelectTrigger id="add-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="person">Individuel</SelectItem>
                  <SelectItem value="group">Groupe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.type === 'group' && (
              <div className="grid gap-2">
                <Label htmlFor="add-people-count">Nombre de personnes</Label>
                <Input
                  id="add-people-count"
                  type="number"
                  min="2"
                  max="100"
                  value={form.peopleCountInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setForm((f) => {
                      const parsed = parseInt(raw, 10);
                      const valid = Number.isFinite(parsed) && parsed >= 2 && parsed <= 100;
                      const peopleCount = valid ? parsed : f.peopleCount;
                      const groupMembers = valid && parsed !== f.groupMembers.length
                        ? Array.from({ length: parsed }, (_, i) => f.groupMembers[i] || emptyMember())
                        : f.groupMembers;
                      return { ...f, peopleCountInput: raw, peopleCount, groupMembers };
                    });
                  }}
                  onBlur={() => {
                    setForm((f) => {
                      const parsed = parseInt(f.peopleCountInput, 10);
                      const norm = Number.isFinite(parsed) && parsed >= 2
                        ? Math.min(100, parsed)
                        : 2;
                      const groupMembers = norm !== f.groupMembers.length
                        ? Array.from({ length: norm }, (_, i) => f.groupMembers[i] || emptyMember())
                        : f.groupMembers;
                      return {
                        ...f,
                        peopleCount: norm,
                        peopleCountInput: String(norm),
                        groupMembers,
                      };
                    });
                  }}
                />
              </div>
            )}
          </div>
          {form.type === 'group' && (
            <GroupMembersEditor
              peopleCount={form.peopleCount}
              value={form.groupMembers}
              onChange={(groupMembers) => setForm((f) => ({ ...f, groupMembers }))}
            />
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="add-phone">Téléphone</Label>
              <Input
                id="add-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="05....."
                maxLength={20}
                inputMode="tel"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                maxLength={120}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-notes">Notes</Label>
            <Textarea
              id="add-notes"
              rows={3}
              maxLength={500}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Annuler</Button>
            <Button type="submit" disabled={submitting}>
              <Plus /> {submitting ? 'Ajout...' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </form>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Colonnes attendues : <code>type, nom, prenom, tel, mail</code>. Types acceptés : Individuel, Groupe.
          </p>
          <label
            htmlFor="csv-file-input"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input bg-secondary/30 px-4 py-6 text-center transition-colors hover:bg-secondary/60"
          >
            <Upload className="size-6 text-muted-foreground" />
            <div className="text-sm font-medium text-foreground">
              {fileName ? 'Changer de fichier' : 'Choisir un fichier CSV'}
            </div>
            <div className="text-xs text-muted-foreground">
              {fileName || 'Aucun fichier sélectionné'}
            </div>
            <input
              ref={fileRef}
              id="csv-file-input"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => setFileName(e.target.files?.[0]?.name || '')}
            />
          </label>
          {importError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle size={14} /> {importError}
            </div>
          )}
          {importResult && (
            <div className="text-sm grid gap-1">
              <div className="text-emerald-700 dark:text-emerald-400">{importResult.created} créé(s)</div>
              {importResult.failed > 0 && (
                <>
                  <div className="text-amber-700 dark:text-amber-400">{importResult.failed} en erreur</div>
                  <ul className="mt-1 max-h-40 overflow-y-auto pl-5 list-disc">
                    {importResult.errors.map((er, i) => (
                      <li key={i} className="text-muted-foreground">
                        Ligne {er.line} — {er.error}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={importing}>Fermer</Button>
            <Button type="button" onClick={submitCsv} disabled={importing}>
              <Upload /> {importing ? 'Import...' : 'Importer'}
            </Button>
          </DialogFooter>
        </div>
      )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk share modal ──────────────────────────────────────────────
function BulkShareModal({ isOpen, mode, onClose, travelers, trip, agencyName }) {
  const isWa = mode === 'whatsapp';
  const title = isWa ? 'Envoyer les QR codes par WhatsApp' : 'Envoyer les QR codes par email';
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Ouvrez un envoi à la fois pour éviter le blocage de votre navigateur.
          </DialogDescription>
        </DialogHeader>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '60vh', overflowY: 'auto' }}>
          {travelers.map(t => {
            const qrLink = getTravelerQrLink(t.referenceCode);
            const link = isWa
              ? buildWhatsAppLink({ traveler: t, trip, qrLink, agencyName })
              : buildMailtoLink({ traveler: t, trip, qrLink, agencyName });
            const missing = isWa ? !t.phone : !t.email;
            return (
              <li
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.displayName}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {missing
                      ? (isWa ? 'Téléphone manquant' : 'Email manquant')
                      : (isWa ? t.phone : t.email)}
                  </div>
                </div>
                {link ? (
                  <Button asChild size="sm">
                    <a
                      href={link}
                      target={isWa ? '_blank' : undefined}
                      rel={isWa ? 'noopener noreferrer' : undefined}
                    >
                      <Send /> Ouvrir
                    </a>
                  </Button>
                ) : (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>—</span>
                )}
              </li>
            );
          })}
        </ul>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
