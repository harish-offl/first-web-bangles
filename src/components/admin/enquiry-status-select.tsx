"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";

import { updateOrderStatusAction } from "@/app/admin/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORDER_STATUS_LABELS, allowedTransitions } from "@/lib/orders/lifecycle";
import type { OrderStatus } from "@/types";

interface EnquiryStatusSelectProps {
  id: string;
  status: OrderStatus;
}

export function EnquiryStatusSelect({ id, status }: EnquiryStatusSelectProps) {
  const [pending, startTransition] = useTransition();
  const statuses = [status, ...allowedTransitions(status)].filter(
    (value, index, list) => list.indexOf(value) === index,
  );

  function handleChange(next: OrderStatus) {
    if (next === status) return;
    const formData = new FormData();
    formData.set("id", id);
    formData.set("status", next);
    startTransition(() => {
      void updateOrderStatusAction(formData);
    });
  }

  return (
    <Select value={status} onValueChange={(value) => handleChange(value as OrderStatus)}>
      <SelectTrigger size="sm" disabled={pending} aria-label="Enquiry status">
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <SelectValue />
        )}
      </SelectTrigger>
      <SelectContent>
        {statuses.map((value) => (
          <SelectItem key={value} value={value}>
            {ORDER_STATUS_LABELS[value] ?? value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
