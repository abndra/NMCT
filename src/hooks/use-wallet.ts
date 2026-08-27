import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { onBalanceChange, onMyTopupsChange, onWalletTxChange, type TopupRequest, type WalletTx } from "@/lib/wallet";

/** رصيد المستخدم الحالي بالريال العُماني (يتحدّث لحظياً). */
export function useBalance() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setBalance(0);
      setReady(true);
      return;
    }
    let unsub = () => {};
    try {
      unsub = onBalanceChange(user.uid, (v) => {
        setBalance(v);
        setReady(true);
      });
    } catch {
      setReady(true);
    }
    return () => unsub();
  }, [user?.uid]);

  return { balance, ready };
}

export function useMyTopups() {
  const { user } = useAuth();
  const [items, setItems] = useState<TopupRequest[]>([]);
  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let unsub = () => {};
    try {
      unsub = onMyTopupsChange(user.uid, setItems);
    } catch {
      /* ignore */
    }
    return () => unsub();
  }, [user?.uid]);
  return items;
}

export function useMyWalletTx() {
  const { user } = useAuth();
  const [items, setItems] = useState<WalletTx[]>([]);
  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let unsub = () => {};
    try {
      unsub = onWalletTxChange(user.uid, setItems);
    } catch {
      /* ignore */
    }
    return () => unsub();
  }, [user?.uid]);
  return items;
}
