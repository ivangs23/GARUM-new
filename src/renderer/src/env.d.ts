/// <reference types="vite/client" />

import type { AppConfig, Order, PrinterConfig, DiscoveredPrinter } from '../../shared/types';

declare global {
  interface Window {
    api: {
      getOrders:            ()                          => Promise<Order[]>;
      markDone:             (id: string)                => Promise<void>;
      getConfig:            ()                          => Promise<AppConfig>;
      saveConfig:           (c: AppConfig)              => Promise<void>;
      onOrdersInit:         (cb: (o: Order[]) => void)  => void;
      onNewOrder:           (cb: (o: Order)  => void)   => void;
      onOrderRemoved:       (cb: (id: string) => void)  => void;
      onConnectionStatus:   (cb: (s: string) => void)   => void;
      off:                  (channel: string)            => void;
      listWindowsPrinters:  ()                          => Promise<DiscoveredPrinter[]>;
      scanNetworkPrinters:  ()                          => Promise<DiscoveredPrinter[]>;
      testPrinter:          (c: PrinterConfig)          => Promise<void>;
      listHistory:          (limit: number, offset: number) => Promise<Order[]>;
    };
  }
}
