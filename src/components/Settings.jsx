/**
 * Portal Settings - Admin configuration for partner tiers
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, TextField, Button, Paper, Alert, Snackbar,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, Tooltip, Switch, FormControlLabel
} from '@mui/material';
import { 
  Settings as SettingsIcon, Add, Edit, Delete,
  ArrowUpward, ArrowDownward, Check
} from '@mui/icons-material';
import { PageHeader, PageContent, SectionCard, ActionButton } from './ui/NintexUI';
import { useAuth } from '../context/AuthContext';

const DEFAULT_COLORS = [
  '#42A5F5', '#1565C0', '#FF6B35', '#FFD700', '#FFA500', 
  '#9C27B0', '#4CAF50', '#E91E63', '#00BCD4', '#795548'
];

export default function Settings() {
  const { token, hasPermission } = useAuth();
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTier, setEditingTier] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    npcu_required: 0,
    color: '#666666',
    is_active: true
  });
  
  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tierToDelete, setTierToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const canEdit = hasPermission('settings', 'edit');

  // Fetch tiers
  const fetchTiers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/db/tiers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTiers(data);
      } else {
        throw new Error('Failed to load tiers');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchTiers();
    }
  }, [token, fetchTiers]);

  // Open edit dialog
  const handleEdit = (tier) => {
    setEditingTier(tier);
    setEditForm({
      name: tier?.name || '',
      description: tier?.description || '',
      npcu_required: tier?.npcu_required || 0,
      color: tier?.color || '#666666',
      is_active: tier?.is_active !== false
    });
    setEditDialogOpen(true);
  };

  // Open add dialog
  const handleAdd = () => {
    setEditingTier(null);
    setEditForm({
      name: '',
      description: '',
      npcu_required: 0,
      color: DEFAULT_COLORS[tiers.length % DEFAULT_COLORS.length],
      is_active: true
    });
    setEditDialogOpen(true);
  };

  // Save tier (create or update)
  const handleSave = async () => {
    if (!editForm.name.trim()) {
      setError('Tier name is required');
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      const url = editingTier 
        ? `/api/db/tiers/${editingTier.id}`
        : '/api/db/tiers';
      
      const response = await fetch(url, {
        method: editingTier ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editForm)
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save tier');
      }
      
      setSuccess(editingTier ? 'Tier updated successfully' : 'Tier created successfully');
      setEditDialogOpen(false);
      fetchTiers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Open delete confirmation
  const handleDeleteClick = (tier) => {
    setTierToDelete(tier);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!tierToDelete) return;
    
    setSaving(true);
    setDeleteError(null);
    
    try {
      const response = await fetch(`/api/db/tiers/${tierToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete tier');
      }
      
      setSuccess(`Tier "${tierToDelete.name}" deleted successfully`);
      setDeleteDialogOpen(false);
      setTierToDelete(null);
      fetchTiers();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Move tier up or down
  const handleMove = async (tier, direction) => {
    const currentIndex = tiers.findIndex(t => t.id === tier.id);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (newIndex < 0 || newIndex >= tiers.length) return;
    
    // Swap tiers
    const newTiers = [...tiers];
    [newTiers[currentIndex], newTiers[newIndex]] = [newTiers[newIndex], newTiers[currentIndex]];
    
    // Update sort_order in database
    try {
      const tierIds = newTiers.map(t => t.id);
      const response = await fetch('/api/db/tiers/reorder', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tierIds })
      });
      
      if (response.ok) {
        setTiers(newTiers.map((t, i) => ({ ...t, sort_order: i + 1 })));
      }
    } catch (err) {
      console.error('Failed to reorder:', err);
    }
  };

  // Toggle active status
  const handleToggleActive = async (tier) => {
    try {
      const response = await fetch(`/api/db/tiers/${tier.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ is_active: !tier.is_active })
      });
      
      if (response.ok) {
        setTiers(tiers.map(t => 
          t.id === tier.id ? { ...t, is_active: !tier.is_active } : t
        ));
      }
    } catch (err) {
      console.error('Failed to toggle active:', err);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <PageContent>
      <PageHeader
        icon={<SettingsIcon sx={{ color: '#6B4C9A' }} />}
        title="Portal Settings"
        subtitle="Manage partner tiers and their NPCU requirements"
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <SectionCard 
        title="Partner Tiers" 
        icon="🏆"
        subtitle="Define the tiers available for partner classification and their NPCU requirements"
        action={
          canEdit && (
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleAdd}
              sx={{ 
                backgroundColor: '#FF6B35',
                '&:hover': { backgroundColor: '#E55A2B' }
              }}
            >
              Add Tier
            </Button>
          )
        }
      >
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                {canEdit && <TableCell sx={{ width: 80 }}>Order</TableCell>}
                <TableCell sx={{ fontWeight: 600 }}>Tier</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 120 }}>NPCU Required</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 100 }}>Status</TableCell>
                {canEdit && <TableCell sx={{ fontWeight: 600, width: 120 }}>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {tiers.map((tier, index) => (
                <TableRow 
                  key={tier.id} 
                  hover
                  sx={{ 
                    opacity: tier.is_active ? 1 : 0.6,
                    backgroundColor: tier.is_active ? 'inherit' : '#f9f9f9'
                  }}
                >
                  {canEdit && (
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton 
                          size="small" 
                          onClick={() => handleMove(tier, 'up')}
                          disabled={index === 0}
                        >
                          <ArrowUpward fontSize="small" />
                        </IconButton>
                        <IconButton 
                          size="small" 
                          onClick={() => handleMove(tier, 'down')}
                          disabled={index === tiers.length - 1}
                        >
                          <ArrowDownward fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  )}
                  <TableCell>
                    <Chip 
                      label={tier.name} 
                      size="small"
                      sx={{ 
                        backgroundColor: tier.color || '#666',
                        color: isLightColor(tier.color) ? '#333' : '#fff',
                        fontWeight: 600
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {tier.description || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body1" fontWeight={500}>
                      {tier.npcu_required}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <Switch
                        checked={tier.is_active}
                        onChange={() => handleToggleActive(tier)}
                        size="small"
                        color="success"
                      />
                    ) : (
                      <Chip
                        label={tier.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        color={tier.is_active ? 'success' : 'default'}
                      />
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => handleEdit(tier)}>
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton 
                            size="small" 
                            onClick={() => handleDeleteClick(tier)}
                            color="error"
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {tiers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit ? 6 : 4} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No tiers defined. Click "Add Tier" to create one.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Tip: Use the arrows to reorder tiers. Only active tiers appear in dropdowns throughout the portal.
          </Typography>
        </Box>
      </SectionCard>

      {/* Edit/Add Dialog */}
      <Dialog 
        open={editDialogOpen} 
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingTier ? `Edit Tier: ${editingTier.name}` : 'Add New Tier'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Tier Name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
              fullWidth
              placeholder="e.g., Premier Plus"
            />
            <TextField
              label="Description"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              multiline
              rows={2}
              fullWidth
              placeholder="Brief description of this tier level"
            />
            <TextField
              label="NPCU Required"
              type="number"
              value={editForm.npcu_required}
              onChange={(e) => setEditForm({ ...editForm, npcu_required: parseInt(e.target.value) || 0 })}
              inputProps={{ min: 0 }}
              fullWidth
              helperText="Minimum NPCU points required for this tier qualification"
            />
            <Box>
              <Typography variant="subtitle2" gutterBottom>Badge Color</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {DEFAULT_COLORS.map(color => (
                  <Box
                    key={color}
                    onClick={() => setEditForm({ ...editForm, color })}
                    sx={{
                      width: 36,
                      height: 36,
                      backgroundColor: color,
                      borderRadius: 1,
                      cursor: 'pointer',
                      border: editForm.color === color ? '3px solid #333' : '1px solid #ccc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      '&:hover': { transform: 'scale(1.1)' },
                      transition: 'transform 0.1s'
                    }}
                  >
                    {editForm.color === color && (
                      <Check sx={{ color: isLightColor(color) ? '#333' : '#fff' }} />
                    )}
                  </Box>
                ))}
              </Box>
              <TextField
                size="small"
                value={editForm.color}
                onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                sx={{ mt: 1, width: 120 }}
                placeholder="#hex"
              />
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                  color="success"
                />
              }
              label="Active (visible in dropdowns)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <ActionButton
            variant="contained"
            onClick={handleSave}
            loading={saving}
            sx={{ 
              backgroundColor: '#FF6B35',
              '&:hover': { backgroundColor: '#E55A2B' }
            }}
          >
            {editingTier ? 'Save Changes' : 'Create Tier'}
          </ActionButton>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
      >
        <DialogTitle>Delete Tier?</DialogTitle>
        <DialogContent>
          {deleteError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          ) : (
            <Typography>
              Are you sure you want to delete the tier <strong>"{tierToDelete?.name}"</strong>?
              This action cannot be undone.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <ActionButton
            variant="contained"
            color="error"
            onClick={handleDeleteConfirm}
            loading={saving}
            disabled={!!deleteError}
          >
            Delete Tier
          </ActionButton>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!success}
        autoHideDuration={3000}
        onClose={() => setSuccess(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      </Snackbar>
    </PageContent>
  );
}

// Helper function to determine if a color is light (for text contrast)
function isLightColor(color) {
  if (!color) return false;
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}
