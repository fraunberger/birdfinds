"use client";

import React, { useState } from "react";
import { Plus, RotateCcw } from "lucide-react";

// --- Types ---
type Person = {
    id: string;
    name: string;
    individualItems: { [itemId: string]: string }; // Map of itemRowId -> amount
};

type ItemRow = {
    id: string;
    label: string; // e.g., "Item 1", "Item 2"
};

type SharedItem = {
    id: string;
    name: string;
    amount: string;
    checkedPeople: { [personId: string]: boolean };
};

export function BillSplitter() {
    // --- State Initialization ---
    // Default people requested by user
    const initialNames = ["Mike", "Erin", "Alexa", "Robb", "Emily", "Vishy", "Christian"];
    const initialPeople = initialNames.map((name, i) => ({
        id: `p${i}`,
        name: name,
        individualItems: {},
    }));

    const [people, setPeople] = useState<Person[]>(initialPeople);

    const [individualItemRows, setIndividualItemRows] = useState<ItemRow[]>([
        { id: "r1", label: "Item 1" },
        { id: "r2", label: "Item 2" },
        { id: "r3", label: "Item 3" },
    ]);

    const [sharedItems, setSharedItems] = useState<SharedItem[]>([
        { id: "s1", name: "Appetizer 1", amount: "", checkedPeople: {} },
        { id: "s2", name: "Wine Bottle", amount: "", checkedPeople: {} },
    ]);

    const [receiptSubtotalInput, setReceiptSubtotalInput] = useState<string>("");
    const [receiptGrandTotalInput, setReceiptGrandTotalInput] = useState<string>("");

    // --- Helpers ---
    const val = (s: string) => parseFloat(s) || 0;

    // --- Handlers ---
    const handleNameChange = (id: string, newName: string) => {
        setPeople(people.map((p) => (p.id === id ? { ...p, name: newName } : p)));
    };

    const addPerson = () => {
        const newId = `p${Date.now()}`;
        setPeople([...people, { id: newId, name: "New", individualItems: {} }]);
    };

    const clearNames = () => {
        if (confirm("Clear all names and reset columns?")) {
            const newPeople = Array.from({ length: 3 }, (_, i) => ({
                id: `p${Date.now()}-${i}`,
                name: "",
                individualItems: {}
            }));
            setPeople(newPeople);
        }
    };

    const handleIndivAmountChange = (personId: string, rowId: string, amount: string) => {
        setPeople(
            people.map((p) =>
                p.id === personId
                    ? { ...p, individualItems: { ...p.individualItems, [rowId]: amount } }
                    : p
            )
        );
    };

    const handleSharedNameChange = (id: string, name: string) => {
        setSharedItems(sharedItems.map((s) => (s.id === id ? { ...s, name } : s)));
    };

    const handleSharedAmountChange = (id: string, amount: string) => {
        setSharedItems(sharedItems.map((s) => (s.id === id ? { ...s, amount } : s)));
    };

    const toggleSharedCheck = (itemId: string, personId: string) => {
        setSharedItems(
            sharedItems.map((s) => {
                if (s.id !== itemId) return s;
                return {
                    ...s,
                    checkedPeople: {
                        ...s.checkedPeople,
                        [personId]: !s.checkedPeople[personId],
                    },
                };
            })
        );
    };

    // --- Calculations ---
    // 1. Calculate Per Person Subtotal
    const getPersonSubtotal = (p: Person) => {
        let sum = 0;
        // Individual
        Object.values(p.individualItems).forEach((amt) => (sum += val(amt)));
        // Shared
        sharedItems.forEach((s) => {
            const amount = val(s.amount);
            const involvedIds = Object.keys(s.checkedPeople).filter((k) => s.checkedPeople[k]);
            if (s.checkedPeople[p.id] && involvedIds.length > 0) {
                sum += amount / involvedIds.length;
            }
        });
        return sum;
    };

    const personSubtotals = people.map((p) => getPersonSubtotal(p));
    const calculatedSubtotal = personSubtotals.reduce((a, b) => a + b, 0);

    const receiptSubtotal = val(receiptSubtotalInput);
    const receiptGrandTotal = val(receiptGrandTotalInput);

    // Validation
    const subtotalMismatch = Math.abs(receiptSubtotal - calculatedSubtotal) > 0.1; // 10 cent tolerance
    const validationColor = subtotalMismatch && receiptSubtotal > 0 ? "bg-red-500 text-white" : "bg-neutral-100 text-black";

    // Multiplier logic
    const multiplier =
        receiptGrandTotal > 0 && calculatedSubtotal > 0
            ? receiptGrandTotal / calculatedSubtotal
            : 1;

    // Distribute rounding differences
    const finalDistributions = personSubtotals.map((sub) => sub * multiplier);
    const roundedAmounts = finalDistributions.map((amt) => Math.round(amt * 100) / 100);

    if (receiptGrandTotal > 0 && calculatedSubtotal > 0) {
        const currentSum = roundedAmounts.reduce((a, b) => a + b, 0);
        let diff = receiptGrandTotal - currentSum;
        diff = Math.round(diff * 100) / 100;
        let cents = Math.round(diff * 100);

        let i = 0;
        while (cents !== 0) {
            const idx = i % people.length;
            if (personSubtotals[idx] > 0) {
                roundedAmounts[idx] += cents > 0 ? 0.01 : -0.01;
                roundedAmounts[idx] = Math.round(roundedAmounts[idx] * 100) / 100;
                cents -= cents > 0 ? 1 : -1;
            }
            i++;
            if (i > 1000) break;
        }
    }

    return (
        <div className="w-full overflow-x-auto text-xs font-mono pb-20">

            {/* 1. TOP BAR: Totals & Validation */}
            <div className="flex flex-col md:flex-row flex-wrap gap-6 mb-6 items-start md:items-end border border-black p-4">
                {/* Main Inputs Grouped */}
                <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                    <div className="flex flex-col w-full sm:w-auto">
                        <label className="uppercase font-bold mb-1">Receipt Subtotal</label>
                        <div className={`flex items-center border border-black w-full sm:w-32 ${validationColor}`}>
                            <span className="pl-2 font-bold text-lg">$</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={receiptSubtotalInput}
                                onChange={(e) => setReceiptSubtotalInput(e.target.value)}
                                className="p-2 w-full font-bold text-lg focus:outline-none text-right bg-transparent no-arrows"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col w-full sm:w-auto">
                        <label className="uppercase font-bold mb-1">Including Tax/Tip</label>
                        <div className="flex items-center border border-black w-full sm:w-36 bg-yellow-50">
                            <span className="pl-2 font-bold text-lg">$</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                placeholder="Total"
                                value={receiptGrandTotalInput}
                                onChange={(e) => setReceiptGrandTotalInput(e.target.value)}
                                className="p-2 w-full font-bold text-lg focus:outline-none text-right bg-transparent no-arrows"
                            />
                        </div>
                    </div>
                </div>

                <div className="h-px w-full md:w-px md:h-10 bg-black md:border-r md:border-black md:bg-transparent mx-0 md:mx-4 my-2 md:my-0"></div>

                {/* Validation Status */}
                <div className="flex flex-col w-full sm:w-auto">
                    <label className="uppercase font-bold mb-1 text-neutral-400">Calculated Sum</label>
                    <div className={`border border-black p-2 w-full sm:w-32 bg-neutral-50 text-right ${subtotalMismatch && receiptSubtotal > 0 ? "text-red-500 font-bold border-red-500" : ""}`}>
                        ${calculatedSubtotal.toFixed(2)}
                    </div>
                </div>

                {subtotalMismatch && receiptSubtotal > 0 && (
                    <div className="text-red-600 font-bold self-start md:self-center animate-pulse uppercase tracking-widest text-sm border border-red-600 px-2 py-1 mt-2 md:mt-0">
                        ⚠ Check Sum Mismatch
                    </div>
                )}

                <div className="flex flex-col ml-auto mt-2 md:mt-0">
                    <label className="uppercase font-bold mb-1 text-neutral-400">Multiplier</label>
                    <div className="p-2 font-mono text-neutral-500">
                        x{multiplier.toFixed(4)}
                    </div>
                </div>
            </div>

            <table className="w-full border-collapse border border-black min-w-[800px]">
                {/* 2. SHARED ITEMS SECTIONS (Appetizers) - ABOVE NAMES */}
                <thead>
                    <tr className="bg-neutral-100">
                        <td colSpan={people.length + 2} className="border border-black p-1 font-bold text-center uppercase tracking-widest text-neutral-500 text-[10px]">
                            Shared Items (Appetizers, Wine, etc.)
                        </td>
                    </tr>
                </thead>
                <tbody>
                    {sharedItems.map((s) => (
                        <tr key={s.id}>
                            {/* Changed first cell to vertical stack to fit narrow column */}
                            <td className="border border-black p-1 bg-white min-w-[96px] w-24 align-top">
                                <div className="flex flex-col gap-1">
                                    <input
                                        type="text"
                                        value={s.name}
                                        onChange={(e) => handleSharedNameChange(s.id, e.target.value)}
                                        className="w-full bg-transparent focus:outline-none font-bold placeholder-neutral-300 text-[10px]"
                                        placeholder="Item"
                                    />
                                    <div className="relative">
                                        <span className="absolute left-0 top-0 font-bold text-xs">$</span>
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            value={s.amount}
                                            onChange={(e) => handleSharedAmountChange(s.id, e.target.value)}
                                            className="w-full border-b-2 border-black text-right focus:outline-none placeholder-neutral-300 font-bold bg-yellow-50 text-xs pl-3 no-arrows"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            </td>
                            {people.map((p) => (
                                <td key={p.id} className="border border-black p-1 text-center hover:bg-neutral-50 cursor-pointer w-20 align-middle" onClick={() => toggleSharedCheck(s.id, p.id)}>
                                    <div className="flex justify-center items-center h-full">
                                        <div className={`w-4 h-4 border border-black flex items-center justify-center ${s.checkedPeople[p.id] ? 'bg-black' : 'bg-white'}`}>
                                            {/* No check icon, just black fill */}
                                        </div>
                                    </div>
                                </td>
                            ))}
                            <td className="border border-black bg-neutral-100"></td>
                        </tr>
                    ))}
                    <tr>
                        <td colSpan={people.length + 2} className="p-1 border border-black text-center cursor-pointer hover:bg-neutral-100 text-neutral-500" onClick={() => setSharedItems([...sharedItems, { id: Math.random().toString(), name: "New Shared", amount: "", checkedPeople: {} }])}>
                            + ADD SHARED ROW
                        </td>
                    </tr>
                </tbody>

                {/* 3. NAME ROW (Anchor) */}
                <thead>
                    <tr className="border-t-4 border-b-4 border-black">
                        <th className="border-r border-black p-2 bg-white text-black text-right w-24 min-w-[96px] group relative">
                            {/* Reset button hidden until hover */}
                            <div className="absolute left-2 top-0 bottom-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-red-500" onClick={clearNames} title="Clear All">
                                <RotateCcw className="w-4 h-4" />
                            </div>
                        </th>
                        {people.map((p) => (
                            <th key={p.id} className="border-r border-black p-1 min-w-[80px] bg-white">
                                <input
                                    type="text"
                                    value={p.name}
                                    onChange={(e) => handleNameChange(p.id, e.target.value)}
                                    className="w-full bg-transparent font-black text-center text-black focus:outline-none border-2 border-transparent focus:border-black uppercase text-sm"
                                    placeholder="NAME"
                                />
                            </th>
                        ))}
                        <th className="border-r border-black p-1 w-10 bg-neutral-100 cursor-pointer hover:bg-neutral-200" onClick={addPerson}>
                            <div className="flex items-center justify-center h-full">
                                <Plus className="w-4 h-4" />
                            </div>
                        </th>
                    </tr>
                </thead>

                {/* 4. INDIVIDUAL ITEMS SECTIONS - BELOW NAMES */}
                <tbody>
                    <tr className="bg-neutral-100">
                        <td colSpan={people.length + 2} className="border border-black p-1 font-bold text-center uppercase tracking-widest text-neutral-500 text-[10px]">
                            Individual Items
                        </td>
                    </tr>
                    {individualItemRows.map((row) => (
                        <tr key={row.id}>
                            <td className="border border-black p-0.5 pl-2 bg-white text-[10px] w-24 min-w-[96px]">
                                <input
                                    className="w-full bg-transparent focus:outline-none font-bold placeholder-neutral-300 py-1"
                                    defaultValue={row.label}
                                />
                            </td>
                            {people.map((p) => (
                                <td key={p.id} className="border border-black p-0">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        placeholder="-"
                                        className="w-full h-full p-0.5 text-center focus:bg-yellow-50 focus:outline-none font-medium placeholder-neutral-200 text-xs no-arrows"
                                        value={p.individualItems[row.id] || ""}
                                        onChange={(e) => handleIndivAmountChange(p.id, row.id, e.target.value)}
                                    />
                                </td>
                            ))}
                            <td className="border border-black bg-neutral-100"></td>
                        </tr>
                    ))}
                    <tr>
                        <td colSpan={people.length + 2} className="p-1 border border-black text-center cursor-pointer hover:bg-neutral-100 text-neutral-500" onClick={() => setIndividualItemRows([...individualItemRows, { id: Math.random().toString(), label: "New Item" }])}>
                            + ADD INDIVIDUAL ROW
                        </td>
                    </tr>
                </tbody>

                {/* 5. FOOTER: Final Amounts */}
                <tfoot>
                    <tr className="border-t-4 border-black">
                        <td className="p-2 font-bold uppercase border border-black text-right pr-4 text-neutral-500 text-[10px]">Calculated Subtotal</td>
                        {personSubtotals.map((sub, i) => (
                            <td key={i} className="p-1 text-center font-mono border border-black bg-neutral-50 text-neutral-500 text-xs">
                                {sub > 0 ? `$${sub.toFixed(2)}` : '-'}
                            </td>
                        ))}
                        <td className="border border-black bg-neutral-100"></td>
                    </tr>
                    <tr className="bg-black text-white border-t-8 border-black text-sm">
                        <td className="p-2 font-bold uppercase border-r border-white/50 text-right pr-4">Final Owed</td>
                        {roundedAmounts.map((amt, i) => (
                            <td key={i} className="p-1 text-center font-mono font-bold border-r border-white/50 text-md">
                                ${amt.toFixed(2)}
                            </td>
                        ))}
                        <td className="border-l border-white/50"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}
