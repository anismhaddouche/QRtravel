import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, onActiveAgencyChange } from '../utils/api';
import { SkeletonStats, SkeletonTable } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import {
  Users, UserCheck, UserX, LayoutDashboard, History, RefreshCw,
  MessageCircle, Mail, Copy, Phone, ChevronDown, ChevronUp, MoreHorizontal,
  Plus, Upload, Trash2, Check, CornerUpLeft, Send, AlertCircle, X, Search,
  Plane, Calendar,
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
  referenceCode: '', displayName: '', type: 'person',
  peopleCount: 1, peopleCountInput: '1',
  notes: '', phone: '', email: '',
  groupMembers: [],
};

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

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2400);
  };

  const copyText = async (text, label) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      showToast(label || 'Copié');
    } catch { showToast('Copie impossible'); }
  };

  const filteredTravelers = useMemo(() => {
    let list = travelers;
    if (filter === 'remaining') list = list.filter(t => t.status === 'not_checked_in');
    else if (filter === 'checked_in') list = list.filter(t => t.status === 'checked_in');
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(t =>
        (t.displayName || '').toLowerCase().includes(q) ||
        (t.referenceCode || '').toLowerCase().includes(q)
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

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllVisible = () => setSelectedIds(new Set(visibleIds));
  const clearSelection = () => setSelectedIds(new Set());

  // ─── Check-in / Undo ────────────────────────────────────────────
  const handleCheckIn = async (t) => {
    try {
      await api.manualCheckIn(t.id, tripId);
      showToast(`${t.displayName} embarqué(e)`);
      fetchData(true);
    } catch (e) {
      showToast(e.message || 'Erreur lors de l\'embarquement');
    }
  };
  const handleUndo = async (t) => {
    try {
      await api.undoCheckIn(t.referenceCode, tripId);
      showToast(`${t.displayName} dés-embarqué(e)`);
      fetchData(true);
    } catch (e) {
      showToast(e.message || 'Erreur lors du dés-embarquement');
    }
  };

  // ─── Bulk check-in / undo ───────────────────────────────────────
  const handleBulkCheckIn = async () => {
    const ids = selectedTravelers.filter(t => t.status === 'not_checked_in').map(t => t.id);
    if (ids.length === 0) return;
    try {
      const r = await api.bulkManualCheckIn(ids, tripId);
      const skipped = selectedIds.size - r.updated;
      showToast(skipped > 0
        ? `${r.updated} voyageur(s) embarqué(s), ${skipped} ignoré(s)`
        : `${r.updated} voyageur(s) embarqué(s)`);
      clearSelection();
      fetchData(true);
    } catch (e) {
      showToast(e.message || 'Erreur lors de l\'embarquement');
    }
  };
  const handleBulkUndo = async () => {
    const ids = selectedTravelers.filter(t => t.status === 'checked_in').map(t => t.id);
    if (ids.length === 0) return;
    try {
      const r = await api.bulkUndoCheckIn(ids, tripId);
      const skipped = selectedIds.size - r.updated;
      showToast(skipped > 0
        ? `${r.updated} voyageur(s) désembarqué(s), ${skipped} ignoré(s)`
        : `${r.updated} voyageur(s) désembarqué(s)`);
      clearSelection();
      fetchData(true);
    } catch (e) {
      showToast(e.message || 'Erreur lors du désembarquement');
    }
  };

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

  const goToTraveler = (id) => navigate(`/travelers/${id}`);
  const rowKeyDown = (e, id) => {
    if (e.key === 'Enter') { e.preventDefault(); goToTraveler(id); }
  };

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
          refreshing={refreshing}
          onRefresh={() => fetchData(true)}
        />
      )}

      {/* Travelers list */}
      <div className="list-shell">
        <div className="section-head">
          <h2 className="section-head__title">
            <CurrentIcon size={16} style={{ color: 'var(--accent)' }} />
            {current.label}
            <span className="section-head__count">· {filteredTravelers.length}</span>
          </h2>
          <Button
            onClick={() => setShowAdd(true)}
            disabled={!tripId}
            title={tripId ? 'Ajouter des voyageurs' : 'Sélectionnez d\'abord un voyage'}
            className={isMobile ? 'hidden' : ''}
          >
            <Plus /> Ajouter
          </Button>
        </div>

        <div className="toolbar">
          <div className="toolbar__search">
            <Search size={16} className="toolbar__search-icon" />
            <input
              type="text"
              className="input-search"
              placeholder="Rechercher par nom ou code…"
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

        {/* Selection bar */}
        {selectionCount > 0 && (
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
        )}

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
                  onSelect={() => toggleSelect(t.id)}
                  onOpen={() => goToTraveler(t.id)}
                  onCheckIn={() => handleCheckIn(t)}
                  onUndo={() => handleUndo(t)}
                  onCopy={(text, label) => copyText(text, label)}
                />
              ))}
            </ul>
          </>
        )}
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
          style={{
            position: 'fixed', bottom: '88px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--surface-2, rgba(0,0,0,0.85))', color: 'var(--white)',
            padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
            fontSize: '0.85rem', zIndex: 1000, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          {toast}
        </div>
      )}

      {/* Mobile FAB — primary CTA always reachable */}
      {isMobile && tripId && (
        <button
          type="button"
          className="fab"
          aria-label="Ajouter des voyageurs"
          onClick={() => setShowAdd(true)}
        >
          <Plus size={26} />
        </button>
      )}
    </div>
  );
}

// ─── Trip Hero (compact header — no progress bar) ──────────────────
function TripHero({ trip, stats, refreshing, onRefresh }) {
  const total = stats.totalPeople || 0;
  const done = stats.checkedInPeople || 0;
  const left = stats.missingPeople || 0;
  return (
    <section className="trip-hero trip-hero--compact" aria-label="Voyage actif">
      <div className="trip-hero__body">
        <div className="trip-hero__left">
          <span className="trip-hero__eyebrow"><Plane size={11} /> Voyage actif</span>
          <div className="trip-hero__title">{trip?.name || 'Voyage'}</div>
          <div className="trip-hero__meta">
            {trip?.date && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Calendar size={12} /> {trip.date}
              </span>
            )}
            {trip?.agencyName && (
              <>
                <span className="dot" aria-hidden />
                <span>{trip.agencyName}</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Actualiser"
          title="Actualiser"
        >
          <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
        </button>
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
      </div>
    </section>
  );
}

// ─── Boarding-style traveler row ───────────────────────────────────
function BoardRow({ traveler: t, trip, agencyName, checked, onSelect, onOpen, onCheckIn, onUndo, onCopy }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef(null);
  const qrLink = getTravelerQrLink(t.referenceCode);
  const wa = buildWhatsAppLink({ traveler: t, trip, qrLink, agencyName });
  const mt = buildMailtoLink({ traveler: t, trip, qrLink, agencyName });
  const isCheckedIn = t.status === 'checked_in';
  const initials = (t.displayName || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0]).join('') || '?';

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
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(); } }}
    >
      <div className="board-row__check" onClick={stop}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onSelect}
          aria-label={`Sélectionner ${t.displayName}`}
        />
      </div>
      <span className={`avatar avatar--md ${isCheckedIn ? 'avatar--success' : 'avatar--neutral'}`}>
        {initials}
      </span>
      <div className="board-row__main">
        <div className="board-row__name">{t.displayName}</div>
        <div className="board-row__sub">
          <span className="board-row__ref">{t.referenceCode}</span>
          {t.peopleCount > 1 && (
            <span className="board-row__people"><Users size={10} /> {t.peopleCount}</span>
          )}
        </div>
      </div>
      {isCheckedIn ? (
        <button
          type="button"
          className="board-row__action board-row__action--undo"
          onClick={(e) => { stop(e); onUndo(); }}
          aria-label={`Désembarquer ${t.displayName}`}
          title={`Désembarquer ${t.displayName}`}
        >
          <CornerUpLeft size={18} />
        </button>
      ) : (
        <button
          type="button"
          className="board-row__action board-row__action--checkin"
          onClick={(e) => { stop(e); onCheckIn(); }}
          aria-label={`Embarquer ${t.displayName}`}
          title={`Embarquer ${t.displayName}`}
        >
          <Check size={18} />
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
              onClick={() => { setMenuOpen(false); onCopy(qrLink || t.referenceCode, `Lien QR de ${t.displayName} copié`); }}
            >
              <Copy size={15} /> Copier le lien QR
            </button>
            <div className="popover__divider" />
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onOpen(); }}
            >
              <LayoutDashboard size={15} /> Voir la fiche
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

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

  return (
    <div className="selection-bar--v2">
      <div className="sel-count">
        <span className="badge-num">{count}</span>
        <span>{isMobile ? 'sélection' : 'sélectionné(s)'}</span>
        <button
          type="button"
          className="icon-btn"
          onClick={onClear}
          aria-label="Tout désélectionner"
          style={{ width: 28, height: 28 }}
        >
          <X size={14} />
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Button
          size="sm"
          onClick={onBulkCheckIn}
          disabled={!hasRemaining}
          className="bg-emerald-700 hover:bg-emerald-800 text-white"
        >
          <Check /> Embarquer
        </Button>
        {!isMobile && (
          <>
            <Button size="sm" variant="outline" onClick={onBulkUndo} disabled={!hasCheckedIn}>
              <CornerUpLeft /> Désembarquer
            </Button>
            <Button size="sm" variant="outline" onClick={onShareWhatsApp} disabled={!hasPhone}>
              <MessageCircle /> WhatsApp
            </Button>
            <Button size="sm" variant="outline" onClick={onShareEmail} disabled={!hasEmail}>
              <Mail /> Email
            </Button>
            <Button size="sm" variant="destructive" onClick={onDelete}>
              <Trash2 /> Supprimer
            </Button>
          </>
        )}
        {isMobile && (
          <div ref={moreRef} style={{ position: 'relative' }}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMoreOpen(v => !v)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >
              <MoreHorizontal /> Plus
            </Button>
            {moreOpen && (
              <div className="popover" style={{ right: 0, top: 'calc(100% + 6px)' }} role="menu">
                <button type="button" disabled={!hasCheckedIn} onClick={() => { setMoreOpen(false); onBulkUndo(); }}>
                  <CornerUpLeft size={15} /> Désembarquer
                </button>
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
    }
  }, [isOpen]);

  const submitManual = async (e) => {
    e.preventDefault();
    setError('');
    const isGroup = form.type === 'group';
    const peopleCount = isGroup ? Math.max(2, Number(form.peopleCount) || 2) : 1;
    if (isGroup) {
      const memberErr = validateMembers(form.groupMembers, peopleCount);
      if (memberErr) { setError(memberErr); return; }
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        tripId,
        peopleCount,
        phone: form.phone || undefined,
        email: form.email || undefined,
        notes: form.notes || undefined,
        groupMembers: isGroup ? form.groupMembers : undefined,
      };
      await api.createTraveler(payload);
      onDone(`${form.displayName} ajouté(e)`);
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
        <div role="tablist" className="flex gap-2 mb-4">
          <Button
            size="sm"
            variant={mode === 'manual' ? 'default' : 'outline'}
            role="tab"
            aria-selected={mode === 'manual'}
            onClick={() => setMode('manual')}
          >
            <Plus /> Manuel
          </Button>
          <Button
            size="sm"
            variant={mode === 'csv' ? 'default' : 'outline'}
            role="tab"
            aria-selected={mode === 'csv'}
            onClick={() => setMode('csv')}
          >
            <Upload /> Import CSV
          </Button>
        </div>

      {mode === 'manual' ? (
        <form onSubmit={submitManual} className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="add-display-name">Nom d'affichage *</Label>
            <Input
              id="add-display-name"
              required
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-ref-code">Code de référence *</Label>
            <Input
              id="add-ref-code"
              required
              value={form.referenceCode}
              onChange={(e) => setForm({ ...form, referenceCode: e.target.value.toUpperCase() })}
              placeholder="TRV-..."
            />
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
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-notes">Notes</Label>
            <Textarea
              id="add-notes"
              rows={3}
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
          <Input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
          />
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
