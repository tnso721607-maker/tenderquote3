import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Plus, Search, Database, X, Loader2, Trash2, 
  Edit3, TrendingDown, Info, ClipboardList, 
  AlertCircle, Sparkles, FileSpreadsheet, TrendingUp, 
  CheckCircle, ChevronRight, Download, Upload, 
  FileText, Briefcase
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

// --- INTERFACES ---
interface SORItem {
  id: string;
  name: string;
  unit: string;
  rate: number;
  scopeOfWork: string;
  source: string;
  timestamp: number;
}

interface TenderItem {
  id: string;
  name: string;
  quantity: number;
  requestedScope: string;
  estimatedRate?: number;
  matchedRate?: SORItem;
  status: 'pending' | 'matched' | 'review' | 'no-match';
}

// --- UTILS ---
const generateCSV = (headers: string[], rows: any[][], fileName: string) => {
  const content = [
    headers.map(h => `"${h.replace(/"/g, '""')}"`).join(","),
    ...rows.map(row => row.map(cell => {
      const val = cell === null || cell === undefined ? "" : String(cell);
      return `"${val.replace(/"/g, '""')}"`;
    }).join(","))
  ].join("\r\n");
  
  const blob = new Blob(["\uFEFF" + content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", `${fileName}_${new Date().toLocaleDateString()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- GEMINI SERVICE ---
const geminiService = {
  get client() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  },

  async findBestMatchingItem(targetItemName: string, targetScope: string, dbItems: { id: string; name: string }[]): Promise<string | null> {
    if (dbItems.length === 0) return null;
    try {
      const response = await this.client.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `I have a tender item: "${targetItemName}" with scope: "${targetScope}".
        From the database list below, find the ID of the best matching item.
        Return null if no reasonable match is found.
        
        Database Items:
        ${dbItems.map(item => `- ${item.name} (ID: ${item.id})`).join('\n')}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { matchedId: { type: Type.STRING, nullable: true } },
            required: ["matchedId"]
          },
        },
      });
      const result = JSON.parse(response.text || '{}');
      return result.matchedId || null;
    } catch (error) {
      console.error("Match error:", error);
      return null;
    }
  },

  async parseBulkItems(text: string): Promise<any[]> {
    try {
      const response = await this.client.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Extract a list of tender items from this text: "${text}". 
        Include name, quantity, requestedScope, and any provided estimatedRate.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                requestedScope: { type: Type.STRING },
                estimatedRate: { type: Type.NUMBER, nullable: true }
              },
              required: ["name", "quantity", "requestedScope"]
            }
          }
        }
      });
      return JSON.parse(response.text || '[]');
    } catch (e) {
      return [];
    }
  },

  async parseRatesFromText(text: string): Promise<Omit<SORItem, 'id' | 'timestamp'>[]> {
    try {
      const response = await this.client.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Extract Schedule of Rates (SOR) items (name, unit, rate, scopeOfWork, source) from this text: "${text}".`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                unit: { type: Type.STRING },
                rate: { type: Type.NUMBER },
                scopeOfWork: { type: Type.STRING },
                source: { type: Type.STRING },
              },
              required: ["name", "unit", "rate", "scopeOfWork", "source"]
            },
          },
        },
      });
      return JSON.parse(response.text || '[]');
    } catch (error) {
      return [];
    }
  }
};

// --- SUB-COMPONENTS ---

const RateForm: React.FC<{
  editingItem?: SORItem | null;
  onSubmit: (data: Omit<SORItem, 'id' | 'timestamp'>) => void;
  onBulkSubmit: (items: Omit<SORItem, 'id' | 'timestamp'>[]) => void;
  onCancel: () => void;
}> = ({ editingItem, onSubmit, onBulkSubmit, onCancel }) => {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [isProcessing, setIsProcessing] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [previewItems, setPreviewItems] = useState<Omit<SORItem, 'id' | 'timestamp'>[]>([]);
  const [formData, setFormData] = useState({ name: '', unit: '', rate: '', scopeOfWork: '', source: '' });

  useEffect(() => {
    if (editingItem) {
      setFormData({
        name: editingItem.name,
        unit: editingItem.unit,
        rate: editingItem.rate.toString(),
        scopeOfWork: editingItem.scopeOfWork,
        source: editingItem.source,
      });
      setMode('single');
    }
  }, [editingItem]);

  const handleScrape = async () => {
    if (!bulkText.trim()) return;
    setIsProcessing(true);
    const extracted = await geminiService.parseRatesFromText(bulkText);
    setPreviewItems(extracted);
    setIsProcessing(false);
  };

  return (
    <div className="flex flex-col max-h-[90vh]">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div>
          <h3 className="text-xl font-bold text-slate-800">{editingItem ? 'Edit Rate' : 'Add New Rates'}</h3>
          <p className="text-sm text-slate-500">Database entry management</p>
        </div>
        <button onClick={onCancel} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
          <X className="w-5 h-5" />
        </button>
      </div>

      {!editingItem && (
        <div className="flex p-1 bg-slate-100 mx-6 mt-4 rounded-xl border border-slate-200">
          <button onClick={() => setMode('single')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'single' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Manual Entry</button>
          <button onClick={() => setMode('bulk')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'bulk' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>AI Bulk Import</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {mode === 'single' ? (
          <form onSubmit={e => { e.preventDefault(); onSubmit({ ...formData, rate: parseFloat(formData.rate) }); }} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Item Name</label>
              <input placeholder="e.g. 25mm GI Pipe Supply" required className="w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Unit</label>
                <input placeholder="mtr, sqm, lot" required className="w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rate (₹)</label>
                <input placeholder="0.00" type="number" required step="0.01" className="w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value={formData.rate} onChange={e => setFormData({ ...formData, rate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Scope of Work</label>
              <textarea placeholder="Provide technical details, inclusions, and exclusions..." required rows={4} className="w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none" value={formData.scopeOfWork} onChange={e => setFormData({ ...formData, scopeOfWork: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Source Reference</label>
              <input placeholder="CPWD 2023, PWD SOR, Quotation Date" className="w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value={formData.source} onChange={e => setFormData({ ...formData, source: e.target.value })} />
            </div>
            <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-[0.98]">
              {editingItem ? 'Update Entry' : 'Save to SOR Database'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            {!previewItems.length ? (
              <>
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl text-amber-800 text-sm flex items-start">
                  <Info className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
                  <p>Paste text from PDFs, spreadsheets, or scanned documents. Our AI will automatically identify items, units, and prices.</p>
                </div>
                <textarea rows={8} className="w-full px-4 py-3 border rounded-xl font-mono text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Paste text data here..." value={bulkText} onChange={e => setBulkText(e.target.value)} />
                <button onClick={handleScrape} disabled={isProcessing || !bulkText.trim()} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center disabled:opacity-50 transition-all">
                  {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Sparkles className="mr-2" />} Scrape with AI
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-600">Review {previewItems.length} identified items:</p>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                  {previewItems.map((item, idx) => (
                    <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl">
                      <div className="flex justify-between font-bold text-sm"><span>{item.name}</span><span className="text-indigo-600">₹{item.rate}</span></div>
                      <p className="text-[10px] text-slate-500 line-clamp-1 italic mt-1">{item.scopeOfWork}</p>
                    </div>
                  ))}
                </div>
                <button onClick={() => onBulkSubmit(previewItems)} className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all">Import All Items</button>
                <button onClick={() => setPreviewItems([])} className="w-full py-2 text-slate-400 text-sm hover:text-slate-600 transition-colors">Discard and Try Again</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const RateList: React.FC<{ rates: SORItem[]; allRates: SORItem[]; onDelete: (id: string) => void; onEdit: (item: SORItem) => void; }> = ({ rates, allRates, onDelete, onEdit }) => {
  const isLowest = (item: SORItem) => {
    const sameItems = allRates.filter(r => r.name.toLowerCase() === item.name.toLowerCase());
    return sameItems.length > 1 && item.rate === Math.min(...sameItems.map(r => r.rate));
  };

  if (rates.length === 0) return (
    <div className="text-center py-20 bg-white border-dashed border-2 border-slate-200 rounded-3xl flex flex-col items-center">
      <Database className="w-16 h-16 text-slate-100 mb-4" />
      <h3 className="text-lg font-bold text-slate-800">No Rates in Database</h3>
      <p className="text-slate-400 max-w-xs mx-auto mt-2">Your rate cards will appear here. Add them manually or use the AI import feature.</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {rates.map(item => (
        <div key={item.id} className={`bg-white rounded-2xl border p-5 transition-all hover:shadow-lg group relative ${isLowest(item) ? 'border-emerald-200 ring-1 ring-emerald-50' : 'border-slate-100'}`}>
          <div className="flex justify-between items-start mb-2 pr-8">
            <div className="flex-1 min-w-0">
              <span className="text-[10px] uppercase font-bold text-indigo-500 tracking-wider bg-indigo-50 px-2 py-0.5 rounded-md mb-1 inline-block">{item.source || 'Ref'}</span>
              <h4 className="font-bold text-slate-800 text-lg group-hover:text-indigo-600 transition-colors leading-tight truncate" title={item.name}>{item.name}</h4>
            </div>
            {isLowest(item) && <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-1 rounded font-black flex items-center absolute top-4 right-4"><TrendingDown className="w-3 h-3 mr-1" /> BENCHMARK</span>}
          </div>
          <p className="text-sm text-slate-600 line-clamp-3 italic mb-6 leading-relaxed min-h-[4.5rem]">"{item.scopeOfWork}"</p>
          <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-widest">Rate / {item.unit}</span>
              <span className="text-2xl font-black text-slate-900 tracking-tight">₹{item.rate.toLocaleString()}</span>
            </div>
            <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onEdit(item)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Edit3 className="w-4 h-4" /></button>
              <button onClick={() => onDelete(item.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
  const [view, setView] = useState<'database' | 'tender'>('database');
  const [sorData, setSorData] = useState<SORItem[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SORItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tenderItems, setTenderItems] = useState<TenderItem[]>([]);
  const [isProcessingTender, setIsProcessingTender] = useState(false);
  const [tenderInputText, setTenderInputText] = useState('');

  // Persistence logic
  useEffect(() => {
    const saved = localStorage.getItem('smart_rate_store_v3');
    if (saved) {
      try {
        setSorData(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load saved data");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('smart_rate_store_v3', JSON.stringify(sorData));
  }, [sorData]);

  const handleAddOrUpdateRate = (item: Omit<SORItem, 'id' | 'timestamp'>) => {
    if (editingItem) {
      setSorData(prev => prev.map(r => r.id === editingItem.id ? { ...item, id: r.id, timestamp: r.timestamp } : r));
    } else {
      setSorData(prev => [{ ...item, id: crypto.randomUUID(), timestamp: Date.now() }, ...prev]);
    }
    setIsFormOpen(false);
    setEditingItem(null);
  };

  const handleBackup = () => {
    const blob = new Blob([JSON.stringify(sorData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartrate_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDatabase = () => {
    const headers = ['Item Name', 'Unit', 'Rate (₹)', 'Scope of Work', 'Source Reference', 'Date Added'];
    const rows = sorData.map(i => [
      i.name,
      i.unit,
      i.rate,
      i.scopeOfWork,
      i.source,
      new Date(i.timestamp).toLocaleDateString()
    ]);
    generateCSV(headers, rows, 'SmartRate_Database');
  };

  const handleExportTender = () => {
    const headers = [
      'Tender Item', 
      'Quantity', 
      'Requested Scope', 
      'Estimated Rate (₹)', 
      'Quoted Rate (₹)', 
      'Unit', 
      'Total Quoted (₹)', 
      'Matched Database Item',
      'Source', 
      'Status'
    ];
    
    const rows = tenderItems.map(i => [
      i.name,
      i.quantity,
      i.requestedScope,
      i.estimatedRate || 'N/A',
      i.matchedRate?.rate || 'N/A',
      i.matchedRate?.unit || 'N/A',
      (i.quantity * (i.matchedRate?.rate || 0)).toFixed(2),
      i.matchedRate?.name || 'N/A',
      i.matchedRate?.source || '',
      i.status.toUpperCase()
    ]);
    
    generateCSV(headers, rows, 'SmartRate_Quotation');
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (Array.isArray(data)) {
          if (confirm(`Restore ${data.length} items? This will replace your current database.`)) {
            setSorData(data);
          }
        }
      } catch (e) {
        alert("Invalid backup file.");
      }
    };
    reader.readAsText(file);
  };

  const handleProcessTender = async () => {
    if (!tenderInputText.trim()) return;
    setIsProcessingTender(true);
    const parsed = await geminiService.parseBulkItems(tenderInputText);
    const results: TenderItem[] = [];
    for (const p of parsed) {
      const matchedId = await geminiService.findBestMatchingItem(p.name, p.requestedScope, sorData.map(d => ({ id: d.id, name: d.name })));
      const match = sorData.find(d => d.id === matchedId);
      results.push({
        id: crypto.randomUUID(),
        name: p.name,
        quantity: p.quantity || 1,
        requestedScope: p.requestedScope,
        estimatedRate: p.estimatedRate,
        matchedRate: match,
        status: match ? 'matched' : 'no-match'
      });
    }
    setTenderItems(results);
    setIsProcessingTender(false);
  };

  const filteredRates = useMemo(() => sorData.filter(i => 
    i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    i.source.toLowerCase().includes(searchQuery.toLowerCase())
  ), [sorData, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 font-sans">
      <header className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b h-16 flex items-center px-6 justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-100 flex items-center justify-center">
            <Briefcase className="text-white w-5 h-5" />
          </div>
          <span className="font-black text-xl tracking-tighter hidden sm:block">SmartRate <span className="text-indigo-500">Estimator</span></span>
        </div>
        
        <nav className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button onClick={() => setView('database')} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${view === 'database' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Database</button>
          <button onClick={() => setView('tender')} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${view === 'tender' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Tender Builder</button>
        </nav>

        <div className="flex items-center space-x-2">
          <button onClick={() => { setEditingItem(null); setIsFormOpen(true); }} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center text-sm shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95">
            <Plus className="w-5 h-5 mr-1" /> Add Rate
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 sm:p-10">
        {view === 'database' ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
              <div>
                <h1 className="text-4xl font-black text-slate-800 tracking-tighter">Rate Repository</h1>
                <p className="text-slate-400 font-medium">Managing {sorData.length} technical benchmark entries.</p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                <div className="relative group w-full sm:w-80">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input placeholder="Search items or refs..." className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                
                <div className="flex space-x-2">
                  <button onClick={handleExportDatabase} className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all" title="Export Database to Excel">
                    <FileSpreadsheet className="w-5 h-5" />
                  </button>
                  <button onClick={handleBackup} className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="Download JSON Backup">
                    <Download className="w-5 h-5" />
                  </button>
                  <label className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer" title="Restore from JSON Backup">
                    <Upload className="w-5 h-5" />
                    <input type="file" className="hidden" accept=".json" onChange={handleRestore} />
                  </label>
                </div>
              </div>
            </div>
            
            <RateList 
              rates={filteredRates} 
              allRates={sorData} 
              onDelete={id => setSorData(s => s.filter(i => i.id !== id))} 
              onEdit={i => { setEditingItem(i); setIsFormOpen(true); }} 
            />
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {tenderItems.length === 0 ? (
              <div className="bg-white p-8 sm:p-12 rounded-[2.5rem] border border-slate-100 text-center shadow-sm">
                <ClipboardList className="w-20 h-20 text-indigo-50 mx-auto mb-6" />
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Automated Quote Generator</h2>
                <p className="text-slate-500 mb-8 max-w-md mx-auto">Paste a list of tender items. Our AI will search your database for matching technical specs and lowest available rates.</p>
                <textarea className="w-full h-48 p-5 border border-slate-200 rounded-3xl bg-slate-50 mb-6 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="Paste items (e.g., 5 units of 10HP Pump, installation of cables...)" value={tenderInputText} onChange={e => setTenderInputText(e.target.value)} />
                <button onClick={handleProcessTender} disabled={isProcessingTender || !tenderInputText.trim() || sorData.length === 0} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-100 flex items-center justify-center transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-50">
                  {isProcessingTender ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : <Sparkles className="w-6 h-6 mr-2" />} Match & Build Quotation
                </button>
                {sorData.length === 0 && <p className="mt-4 text-xs text-red-500 font-bold uppercase tracking-widest bg-red-50 py-2 rounded-lg inline-block px-4">Database is empty! Import rates first.</p>}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Technical Quote Analysis</h2>
                    <p className="text-slate-500 text-sm">Semantic matching results against database benchmarks</p>
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={handleExportTender} className="flex items-center px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg hover:bg-emerald-700 transition-all">
                      <FileSpreadsheet className="w-4 h-4 mr-2" /> Export Quotation
                    </button>
                    <button onClick={() => setTenderItems([])} className="p-2.5 bg-white border border-slate-200 text-slate-300 hover:text-red-500 rounded-xl transition-colors"><Trash2 className="w-5 h-5" /></button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {tenderItems.map(item => (
                    <div key={item.id} className="bg-white p-6 rounded-3xl border border-slate-100 flex flex-col sm:flex-row justify-between gap-6 hover:shadow-md transition-shadow">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-bold text-slate-800 text-lg">{item.name}</h4>
                          <span className="bg-slate-900 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-tighter">Qty: {item.quantity}</span>
                        </div>
                        <p className="text-xs text-slate-400 italic mb-4 line-clamp-1 leading-relaxed">Requested: {item.requestedScope}</p>
                        {item.matchedRate ? (
                          <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 group relative">
                            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1 flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> Verified Database Match</p>
                            <p className="font-bold text-indigo-700 text-sm">{item.matchedRate.name}</p>
                            <p className="text-[10px] text-indigo-400 mt-1 uppercase font-bold">Source: {item.matchedRate.source}</p>
                          </div>
                        ) : (
                          <div className="p-4 bg-red-50 rounded-2xl border border-red-100 text-red-500 text-xs font-bold uppercase flex items-center">
                            <AlertCircle className="w-4 h-4 mr-2" /> No technical match in database
                          </div>
                        )}
                      </div>
                      <div className="text-right min-w-[220px] flex flex-col justify-center border-t sm:border-t-0 sm:border-l border-slate-50 pt-4 sm:pt-0 sm:pl-8">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Quoted Extension</span>
                        <div className="text-4xl font-black text-indigo-600 tracking-tighter">₹{(item.quantity * (item.matchedRate?.rate || 0)).toLocaleString()}</div>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Rate: ₹{(item.matchedRate?.rate || 0).toLocaleString()} / {item.matchedRate?.unit || 'unit'}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-slate-900 text-white p-10 rounded-[3rem] flex flex-col sm:flex-row justify-between items-center shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px] -mr-32 -mt-32" />
                  <div className="relative z-10 text-center sm:text-left">
                    <h3 className="text-2xl font-bold">Consolidated Bid Total</h3>
                    <p className="text-slate-400 text-sm mt-1">Validated against {tenderItems.filter(i => i.matchedRate).length} benchmark matches</p>
                  </div>
                  <div className="relative z-10 text-center sm:text-right mt-6 sm:mt-0">
                    <div className="text-5xl sm:text-6xl font-black text-indigo-400 tracking-tighter tabular-nums">
                      ₹{tenderItems.reduce((s, i) => s + (i.quantity * (i.matchedRate?.rate || 0)), 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsFormOpen(false)} />
          <div className="relative bg-white w-full max-w-xl rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <RateForm 
              editingItem={editingItem} 
              onSubmit={handleAddOrUpdateRate} 
              onBulkSubmit={items => { 
                setSorData(prev => [...items.map(i => ({ ...i, id: crypto.randomUUID(), timestamp: Date.now() })), ...prev]); 
                setIsFormOpen(false); 
              }} 
              onCancel={() => setIsFormOpen(false)} 
            />
          </div>
        </div>
      )}
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
