"use client";

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  acceptedFileTypes?: string[];
  maxFileSize?: number; // in bytes
  uploadedFile?: File | null;
  isUploading?: boolean;
  uploadError?: string | null;
  className?: string;
}

export function FileUpload({
  onFileSelect,
  onFileRemove,
  acceptedFileTypes = ['.pdf', '.doc', '.docx', '.txt', '.md'],
  maxFileSize = 50 * 1024 * 1024, // 50MB default (increased from 10MB)
  uploadedFile,
  isUploading = false,
  uploadError,
  className
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      onFileSelect(file);
    }
    setDragActive(false);
  }, [onFileSelect]);

  const onDropRejected = useCallback((fileRejections: any[]) => {
    setDragActive(false);
    
    // Handle specific rejection reasons
    if (fileRejections.length > 0) {
      const rejection = fileRejections[0];
      const errors = rejection.errors;
      
      if (errors.some((e: any) => e.code === 'file-too-large')) {
        console.error('File too large:', rejection.file.size, 'bytes');
      } else if (errors.some((e: any) => e.code === 'file-invalid-type')) {
        console.error('Invalid file type:', rejection.file.type);
      }
    }
  }, []);

  // Convert file extensions to proper MIME types
  const getMimeTypes = () => {
    const mimeTypeMap: Record<string, string[]> = {
      '.pdf': ['application/pdf'],
      '.doc': ['application/msword'],
      '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      '.txt': ['text/plain'],
      '.md': ['text/markdown', 'text/x-markdown']
    };

    const acceptObject: Record<string, string[]> = {};
    
    acceptedFileTypes.forEach(ext => {
      const mimeTypes = mimeTypeMap[ext];
      if (mimeTypes) {
        mimeTypes.forEach(mimeType => {
          if (!acceptObject[mimeType]) {
            acceptObject[mimeType] = [];
          }
          acceptObject[mimeType].push(ext);
        });
      }
    });

    return acceptObject;
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: getMimeTypes(),
    maxSize: maxFileSize,
    multiple: false,
    disabled: isUploading
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return '📄';
      case 'doc':
      case 'docx':
        return '📝';
      case 'txt':
        return '📄';
      case 'md':
        return '📋';
      default:
        return '📄';
    }
  };

  if (uploadedFile) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="text-2xl">{getFileIcon(uploadedFile.name)}</div>
              <div>
                <p className="font-medium text-sm">{uploadedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(uploadedFile.size)}
                </p>
              </div>
              {!isUploading && !uploadError && (
                <CheckCircle className="h-5 w-5 text-green-500" />
              )}
              {uploadError && (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onFileRemove}
              disabled={isUploading}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {uploadError && (
            <p className="text-xs text-red-500 mt-2">{uploadError}</p>
          )}
          {isUploading && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Uploading...</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardContent className="p-6">
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            isDragActive || dragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50",
            isUploading && "cursor-not-allowed opacity-50"
          )}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center space-y-4">
            <Upload className={cn(
              "h-12 w-12",
              isDragActive || dragActive ? "text-primary" : "text-muted-foreground"
            )} />
            <div>
              <p className="text-lg font-medium">
                {isDragActive ? "Drop the file here" : "Drag & drop a file here"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to select a file from your computer
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              <p>Supported formats: {acceptedFileTypes.join(', ')}</p>
              <p>Maximum file size: {formatFileSize(maxFileSize)}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 