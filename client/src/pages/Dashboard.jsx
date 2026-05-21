import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, onActiveAgencyChange } from '../utils/api';
import { SkeletonStats, SkeletonTable } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import {
  Users, UserCheck, UserX, LayoutDashboard, History, RefreshCw,
  MessageCircle, Mail, Copy, Phone, ChevronDown, ChevronUp,
  Plus, Upload, Trash2, Check, CornerUpLeft, Send, AlertCircle, X, Search,
} from 'lucide-react';
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
  peopleCount: 1, notes: '', phone: '', email: '',
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
        <div className="form-grid-2">
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

  const renderRowActions = (t) => {
    const qrLink = getTravelerQrLink(t.referenceCode);
    const wa = buildWhatsAppLink({ traveler: t, trip, qrLink, agencyName });
    const mt = buildMailtoLink({ traveler: t, trip, qrLink, agencyName });
    const isCheckedIn = t.status === 'checked_in';
    const stop = (e) => e.stopPropagation();
    return (
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}
        onClick={stop}
      >
        {isCheckedIn ? (
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={(e) => { stop(e); handleUndo(t); }}
            title="Désembarquer"
            aria-label={`Désembarquer ${t.displayName}`}
          >
            <CornerUpLeft size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-success"
            onClick={(e) => { stop(e); handleCheckIn(t); }}
            title="Embarquer"
            aria-label={`Embarquer ${t.displayName}`}
          >
            <Check size={14} />
          </button>
        )}
        {t.phone && (
          <a className="btn btn-sm btn-outline" href={`tel:${t.phone}`} onClick={stop} title="Appeler">
            <Phone size={14} />
          </a>
        )}
        {wa && (
          <a className="btn btn-sm btn-outline" href={wa} target="_blank" rel="noopener noreferrer" onClick={stop} title="WhatsApp">
            <MessageCircle size={14} />
          </a>
        )}
        {mt && (
          <a className="btn btn-sm btn-outline" href={mt} onClick={stop} title="Email">
            <Mail size={14} />
          </a>
        )}
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={(e) => { stop(e); copyText(qrLink || t.referenceCode, `Lien QR de ${t.displayName} copié`); }}
          title="Copier le lien du QR code"
        >
          <Copy size={14} />
        </button>
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"><LayoutDashboard size={28} style={{ color: 'var(--accent)' }} /> Tableau de bord</h1>
          <p className="page-subtitle">
            {trip ? trip.name : 'Voyage'} {trip?.date ? `— ${trip.date}` : ''}
          </p>
        </div>
        <button
          className="btn btn-outline"
          onClick={() => fetchData(true)}
          disabled={refreshing}
        >
          <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          Actualiser
        </button>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          <div className="glass-card" style={{ borderTop: '4px solid var(--accent)' }}>
            <div className="flex items-center justify-between mb-4">
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Unités</div>
              <Users size={20} style={{ color: 'var(--accent-light)' }} />
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1, marginBottom: '8px', color: 'var(--white)' }}>{stats.totalUnits}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{stats.totalPeople} personnes</div>
          </div>
          <div className="glass-card" style={{ borderTop: '4px solid var(--success)' }}>
            <div className="flex items-center justify-between mb-4">
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Embarqués</div>
              <UserCheck size={20} style={{ color: 'var(--success-light)' }} />
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1, marginBottom: '8px', color: 'var(--success)' }}>{stats.checkedInUnits}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{stats.checkedInPeople} personnes</div>
          </div>
          <div className="glass-card" style={{ borderTop: '4px solid var(--warning)' }}>
            <div className="flex items-center justify-between mb-4">
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Restants</div>
              <UserX size={20} style={{ color: 'var(--warning-light)' }} />
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1, marginBottom: '8px', color: 'var(--warning)' }}>{stats.missingUnits}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{stats.missingPeople} personnes</div>
          </div>
        </div>
      )}

      {/* Travelers list */}
      <div className="glass-card" style={{ marginBottom: '24px' }}>
        <div className="glass-card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <h2 className="glass-card-title" style={{ color: current.color }}>
            <CurrentIcon size={20} /> {current.label} ({filteredTravelers.length})
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <label htmlFor="dashboard-filter" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Filtrer</label>
            <select
              id="dashboard-filter"
              className="form-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '0.9rem', minWidth: '180px' }}
            >
              {Object.entries(FILTERS).map(([k, f]) => (
                <option key={k} value={k}>{f.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowAdd(true)}
              disabled={!tripId}
              title={tripId ? 'Ajouter des voyageurs' : 'Sélectionnez d\'abord un voyage'}
            >
              <Plus size={14} /> Ajouter des voyageurs
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ marginBottom: '12px', position: 'relative' }}>
          <Search
            size={16}
            style={{
              position: 'absolute', left: '10px', top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            className="form-input"
            placeholder="Rechercher par nom ou code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Rechercher un voyageur"
            style={{ paddingLeft: '34px', paddingRight: search ? '34px' : undefined, width: '100%' }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Effacer la recherche"
              style={{
                position: 'absolute', right: '6px', top: '50%',
                transform: 'translateY(-50%)', background: 'transparent',
                border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                padding: '4px', display: 'flex', alignItems: 'center',
              }}
            >
              <X size={14} />
            </button>
          )}
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
        ) : isMobile ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0 12px' }}>
              <input
                type="checkbox"
                aria-label="Tout sélectionner"
                checked={allVisibleSelected}
                onChange={() => allVisibleSelected ? clearSelection() : selectAllVisible()}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
              </span>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredTravelers.map(t => {
                const checked = selectedIds.has(t.id);
                return (
                  <li
                    key={t.id}
                    style={{
                      padding: '12px',
                      border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      borderRadius: '8px',
                      background: 'var(--surface-1, rgba(255,255,255,0.02))',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => { e.stopPropagation(); toggleSelect(t.id); }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Sélectionner ${t.displayName}`}
                        style={{ marginTop: '4px' }}
                      />
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => goToTraveler(t.id)}
                        onKeyDown={(e) => rowKeyDown(e, t.id)}
                        style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                      >
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{t.displayName}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t.referenceCode}</div>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {t.peopleCount} pers.
                      </div>
                    </div>
                    {renderRowActions(t)}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="table-container">
            <table className="glass-table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}>
                    <input
                      type="checkbox"
                      aria-label="Tout sélectionner"
                      checked={allVisibleSelected}
                      onChange={() => allVisibleSelected ? clearSelection() : selectAllVisible()}
                    />
                  </th>
                  <th>Nom</th>
                  <th>Personnes</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTravelers.map(t => {
                  const checked = selectedIds.has(t.id);
                  return (
                    <tr
                      key={t.id}
                      style={{
                        cursor: 'pointer',
                        background: checked ? 'rgba(99, 102, 241, 0.08)' : undefined,
                      }}
                      onClick={() => goToTraveler(t.id)}
                      onKeyDown={(e) => rowKeyDown(e, t.id)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(t.id)}
                          aria-label={`Sélectionner ${t.displayName}`}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.displayName}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t.referenceCode}</div>
                      </td>
                      <td>{t.peopleCount}</td>
                      <td style={{ textAlign: 'right' }}>{renderRowActions(t)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => !bulkDeleting && setShowDeleteConfirm(false)}
        title={`Supprimer ${selectionCount} voyageur(s) ?`}
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Cette action est irréversible. Les voyageurs sélectionnés et leurs scans seront supprimés.
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setShowDeleteConfirm(false)}
            disabled={bulkDeleting}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
          >
            <Trash2 size={16} /> {bulkDeleting ? 'Suppression...' : 'Supprimer'}
          </button>
        </div>
      </Modal>

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
    </div>
  );
}

// ─── Selection bar ─────────────────────────────────────────────────
function SelectionBar({ count, selectedTravelers, onClear, onDelete, onShareWhatsApp, onShareEmail, onBulkCheckIn, onBulkUndo }) {
  const hasPhone = selectedTravelers.some(t => t.phone);
  const hasEmail = selectedTravelers.some(t => t.email);
  const hasRemaining = selectedTravelers.some(t => t.status === 'not_checked_in');
  const hasCheckedIn = selectedTravelers.some(t => t.status === 'checked_in');
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        margin: '4px 0 12px',
        padding: '10px 12px',
        background: 'var(--accent-bg, rgba(99,102,241,0.15))',
        border: '1px solid var(--accent)',
        borderRadius: '8px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <strong style={{ color: 'var(--text-primary)' }}>{count} sélectionné(s)</strong>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClear} title="Tout désélectionner">
          <X size={14} /> Désélectionner
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        <button
          type="button"
          className="btn btn-sm btn-success"
          onClick={onBulkCheckIn}
          disabled={!hasRemaining}
          title={hasRemaining ? 'Embarquer la sélection' : 'Aucun voyageur restant dans la sélection'}
        >
          <Check size={14} /> Embarquer
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={onBulkUndo}
          disabled={!hasCheckedIn}
          title={hasCheckedIn ? 'Désembarquer la sélection' : 'Aucun voyageur embarqué dans la sélection'}
        >
          <CornerUpLeft size={14} /> Désembarquer
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={onShareWhatsApp}
          disabled={!hasPhone}
          title={hasPhone ? 'Envoyer le QR par WhatsApp' : 'Aucun téléphone dans la sélection'}
        >
          <MessageCircle size={14} /> WhatsApp
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={onShareEmail}
          disabled={!hasEmail}
          title={hasEmail ? 'Envoyer le QR par email' : 'Aucun email dans la sélection'}
        >
          <Mail size={14} /> Email
        </button>
        <button
          type="button"
          className="btn btn-sm btn-danger"
          onClick={onDelete}
          title="Supprimer la sélection"
        >
          <Trash2 size={14} /> Supprimer
        </button>
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
    <Modal isOpen={isOpen} onClose={onClose} title="Ajouter des voyageurs">
      <div role="tablist" style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        <button
          role="tab"
          type="button"
          aria-selected={mode === 'manual'}
          className={mode === 'manual' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline'}
          onClick={() => setMode('manual')}
        >
          <Plus size={14} /> Manuel
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={mode === 'csv'}
          className={mode === 'csv' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline'}
          onClick={() => setMode('csv')}
        >
          <Upload size={14} /> Import CSV
        </button>
      </div>

      {mode === 'manual' ? (
        <form onSubmit={submitManual}>
          <div className="form-group">
            <label className="form-label">Nom d'affichage *</label>
            <input
              required
              className="form-input"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Code de référence *</label>
            <input
              required
              className="form-input"
              value={form.referenceCode}
              onChange={(e) => setForm({ ...form, referenceCode: e.target.value.toUpperCase() })}
              placeholder="TRV-..."
            />
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Type</label>
              <select
                className="form-input"
                value={form.type}
                onChange={(e) => {
                  const type = e.target.value;
                  // Individuel = 1 + members cleared; Groupe min = 2 + at
                  // least 2 empty rows pre-filled.
                  const peopleCount = type === 'person' ? 1 : Math.max(2, form.peopleCount || 0);
                  const groupMembers = type === 'group'
                    ? (form.groupMembers?.length === peopleCount
                        ? form.groupMembers
                        : Array.from({ length: peopleCount }, () => emptyMember()))
                    : [];
                  setForm({ ...form, type, peopleCount, groupMembers });
                }}
              >
                <option value="person">Individuel</option>
                <option value="group">Groupe</option>
              </select>
            </div>
            {form.type === 'group' && (
              <div className="form-group">
                <label className="form-label">Nombre de personnes</label>
                <input
                  type="number"
                  min="2"
                  max="100"
                  className="form-input"
                  value={form.peopleCount}
                  onChange={(e) => {
                    const peopleCount = Math.max(2, Math.min(100, parseInt(e.target.value) || 2));
                    setForm({ ...form, peopleCount });
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
          <div className="form-group">
            <label className="form-label">Téléphone</label>
            <input
              className="form-input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="05....."
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea
              className="form-input"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          {error && (
            <div style={{ color: 'var(--danger-light)', fontSize: '0.85rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              <Plus size={16} /> {submitting ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>
        </form>
      ) : (
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px' }}>
            Colonnes attendues : <code>type, nom, prenom, tel, mail</code>. Types acceptés : Individuel, Groupe.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="form-input"
            style={{ marginBottom: '12px' }}
          />
          {importError && (
            <div style={{ color: 'var(--danger-light)', fontSize: '0.85rem', marginBottom: '12px' }}>
              <AlertCircle size={14} /> {importError}
            </div>
          )}
          {importResult && (
            <div style={{ marginBottom: '12px', fontSize: '0.85rem' }}>
              <div style={{ color: 'var(--success-light)' }}>{importResult.created} créé(s)</div>
              {importResult.failed > 0 && (
                <>
                  <div style={{ color: 'var(--warning-light)' }}>{importResult.failed} en erreur</div>
                  <ul style={{ maxHeight: '160px', overflowY: 'auto', marginTop: '6px', paddingLeft: '20px' }}>
                    {importResult.errors.map((er, i) => (
                      <li key={i} style={{ color: 'var(--text-muted)' }}>
                        Ligne {er.line} — {er.error}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={importing}>Fermer</button>
            <button type="button" className="btn btn-primary" onClick={submitCsv} disabled={importing}>
              <Upload size={16} /> {importing ? 'Import...' : 'Importer'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Bulk share modal ──────────────────────────────────────────────
function BulkShareModal({ isOpen, mode, onClose, travelers, trip, agencyName }) {
  const isWa = mode === 'whatsapp';
  const title = isWa ? 'Envoyer les QR codes par WhatsApp' : 'Envoyer les QR codes par email';
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px' }}>
        Ouvrez un envoi à la fois pour éviter le blocage de votre navigateur.
      </p>
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
                <a
                  className="btn btn-sm btn-primary"
                  href={link}
                  target={isWa ? '_blank' : undefined}
                  rel={isWa ? 'noopener noreferrer' : undefined}
                >
                  <Send size={14} /> Ouvrir
                </a>
              ) : (
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>—</span>
              )}
            </li>
          );
        })}
      </ul>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button type="button" className="btn btn-outline" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
