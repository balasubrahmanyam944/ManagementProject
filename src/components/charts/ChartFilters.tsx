"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, FilterIcon, XIcon } from "lucide-react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";

export interface FilterOptions {
  statuses?: string[];
  types?: string[];
  assignees?: string[];
  priorities?: string[];
  dateRange?: DateRange;
}

interface ChartFiltersProps {
  availableFilters: {
    statuses: string[];
    types: string[];
    assignees: string[];
    priorities: string[];
  };
  onFilterChange: (filters: FilterOptions) => void;
}

export default function ChartFilters({ availableFilters, onFilterChange }: ChartFiltersProps) {
  const [filters, setFilters] = useState<FilterOptions>({
    statuses: undefined,
    types: undefined,
    assignees: undefined,
    priorities: undefined,
    dateRange: {
      from: undefined,
      to: undefined,
    },
  });

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const handleFilterChange = (filterType: keyof FilterOptions, value: any) => {
    const newFilters = { ...filters, [filterType]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
    const newFilters = { ...filters, dateRange: range || undefined };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    const emptyFilters: FilterOptions = {
      statuses: undefined,
      types: undefined,
      assignees: undefined,
      priorities: undefined,
      dateRange: undefined,
    };
    setFilters(emptyFilters);
    setDateRange(undefined);
    onFilterChange(emptyFilters);
  };

  const hasActiveFilters = () => {
    return (
      filters.statuses !== undefined ||
      filters.types !== undefined ||
      filters.assignees !== undefined ||
      filters.priorities !== undefined ||
      filters.dateRange?.from !== undefined ||
      filters.dateRange?.to !== undefined
    );
  };

  return (
    <div className="flex flex-wrap gap-2 mb-4 items-center">
      <div className="flex items-center gap-1">
        <FilterIcon className="h-4 w-4" />
        <span className="text-sm font-medium">Filters:</span>
      </div>

      {/* Status Filter */}
      <Select
        onValueChange={(value) => handleFilterChange('statuses', value === 'all' ? undefined : [value])}
        value={filters.statuses?.[0] || "all"}
      >
        <SelectTrigger className="h-8 w-[150px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {availableFilters.statuses.map((status) => (
            <SelectItem key={status} value={status}>
              {status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Type Filter */}
      <Select
        onValueChange={(value) => handleFilterChange('types', value === 'all' ? undefined : [value])}
        value={filters.types?.[0] || "all"}
      >
        <SelectTrigger className="h-8 w-[150px]">
          <SelectValue placeholder="Issue Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          {availableFilters.types.map((type) => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Assignee Filter */}
      <Select
        onValueChange={(value) => handleFilterChange('assignees', value === 'all' ? undefined : [value])}
        value={filters.assignees?.[0] || "all"}
      >
        <SelectTrigger className="h-8 w-[150px]">
          <SelectValue placeholder="Assignee" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Assignees</SelectItem>
          {availableFilters.assignees.map((assignee) => (
            <SelectItem key={assignee} value={assignee}>
              {assignee}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Priority Filter */}
      <Select
        onValueChange={(value) => handleFilterChange('priorities', value === 'all' ? undefined : [value])}
        value={filters.priorities?.[0] || "all"}
      >
        <SelectTrigger className="h-8 w-[150px]">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priorities</SelectItem>
          {availableFilters.priorities.map((priority) => (
            <SelectItem key={priority} value={priority}>
              {priority}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Date Range Filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-8 justify-start text-left font-normal"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange?.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, "LLL dd, y")} -{" "}
                  {format(dateRange.to, "LLL dd, y")}
                </>
              ) : (
                format(dateRange.from, "LLL dd, y")
              )
            ) : (
              <span>Date Range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={handleDateRangeChange}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>

      {/* Clear Filters Button */}
      {hasActiveFilters() && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="h-8"
        >
          <XIcon className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
