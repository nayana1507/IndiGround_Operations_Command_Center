import { useState, useRef } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Upload, FileText, CheckCircle, AlertTriangle, Download, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

type ImportResult = {
  message: string;
  imported: number;
  errors: string[];
};

export default function ImportFlights() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.name.endsWith(".csv")) {
      setFile(dropped);
      setResult(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/flights/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setResult(data);

      if (data.imported > 0) {
        // Invalidate queries so dashboard refreshes
        queryClient.invalidateQueries({ queryKey: [api.flights.listIncoming.path] });
        queryClient.invalidateQueries({ queryKey: [api.analytics.getStats.path] });
      }
    } catch (err) {
      setResult({ message: "Upload failed. Please try again.", imported: 0, errors: [] });
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    const headers = "flightNumber,airline,aircraftType,arrivalTime,arrivalDelay,fuelLiters,bagsCount,priorityBags,mealsQty,specialMeals,cateringRequired,safetyCheck,actualTat,status";
    const example = "6E-101,IndiGo,Narrow,2025-02-20T08:30:00,5,5200,110,8,118,4,true,true,38,COMPLETED";
    const blob = new Blob([headers + "\n" + example], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flights_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-1">Import Flights</h1>
          <p className="text-muted-foreground">Upload a CSV file to bulk import flight data into the system.</p>
        </div>

        {/* Template Download */}
        <div className="glass-card p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            <div>
              <p className="text-white font-medium text-sm">Need a template?</p>
              <p className="text-muted-foreground text-xs">Download the CSV template with correct column headers</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={downloadTemplate} className="border-white/10 hover:bg-white/5">
            <Download className="w-4 h-4 mr-2" />
            Download Template
          </Button>
        </div>

        {/* Column Reference */}
        <div className="glass-card p-4 rounded-xl">
          <p className="text-white font-medium text-sm mb-3">Required CSV Columns</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ["flightNumber", "e.g. 6E-101"],
              ["airline", "e.g. IndiGo"],
              ["aircraftType", "Narrow or Wide"],
              ["arrivalTime", "ISO format: 2025-02-20T08:30:00"],
              ["arrivalDelay", "Minutes (0 if on time)"],
              ["fuelLiters", "e.g. 5200"],
              ["bagsCount", "Total bags"],
              ["priorityBags", "Priority bag count"],
              ["mealsQty", "Total meals"],
              ["specialMeals", "Special meal count"],
              ["cateringRequired", "true or false"],
              ["safetyCheck", "true or false"],
              ["actualTat", "Actual TAT in mins (optional)"],
              ["status", "SCHEDULED, ACTIVE, or COMPLETED"],
            ].map(([col, hint]) => (
              <div key={col} className="flex items-start gap-2 p-2 bg-white/5 rounded-lg">
                <span className="font-mono text-primary">{col}</span>
                <span className="text-muted-foreground">{hint}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`glass-card rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-white/10 hover:border-white/20"
          }`}
        >
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          {file ? (
            <div className="flex items-center justify-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <span className="text-white font-medium">{file.name}</span>
              <button onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }}>
                <X className="w-4 h-4 text-muted-foreground hover:text-white" />
              </button>
            </div>
          ) : (
            <>
              <p className="text-white font-medium mb-1">Drop your CSV file here</p>
              <p className="text-muted-foreground text-sm">or click to browse</p>
            </>
          )}
        </div>

        {/* Upload Button */}
        <Button
          onClick={handleUpload}
          disabled={!file || isUploading}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isUploading ? "Importing..." : "Import Flights"}
          {!isUploading && <Upload className="w-4 h-4 ml-2" />}
        </Button>

        {/* Result */}
        {result && (
          <div className={`glass-card p-4 rounded-xl border ${result.imported > 0 ? "border-emerald-500/20" : "border-red-500/20"}`}>
            <div className="flex items-center gap-2 mb-2">
              {result.imported > 0 ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              )}
              <p className="text-white font-medium">{result.message}</p>
            </div>

            {result.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Errors:</p>
                {result.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-400 bg-red-500/10 px-3 py-1 rounded">{err}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}