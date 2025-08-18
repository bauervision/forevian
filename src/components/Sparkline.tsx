"use client";
import React from "react";

export function Sparkline({
  values,
  width = 160,
  height = 40,
  strokeWidth = 2,
  ariaLabel,
}: {
  values: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  ariaLabel?: string;
}) {
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;

  const pts = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel || "trend"}
    >
      {/* baseline */}
      <line
        x1="0"
        y1={height - ((0 - min) / range) * height}
        x2={width}
        y2={height - ((0 - min) / range) * height}
        stroke="currentColor"
        opacity="0.12"
      />
      {/* path */}
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        points={pts}
      />
    </svg>
  );
}
