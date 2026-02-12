"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export function BenRiceShrine() {
    const [whizzers, setWhizzers] = useState<number[]>([]);

    useEffect(() => {
        const interval = setInterval(() => {
            setWhizzers((prev) => [...prev, Date.now()].slice(-20)); // Keep max 20 items
        }, 800);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 bg-[#000080] text-white overflow-hidden font-serif z-50 select-text overflow-y-auto">

            {/* Background Grid (CSS only) */}
            <div className="fixed inset-0 opacity-20 pointer-events-none"
                style={{
                    backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                }}>
            </div>

            {/* Nav Bar */}
            <div className="relative z-[100] bg-gray-300 border-b-4 border-white p-2 flex justify-between items-center font-mono">
                <Link href="/" className="bg-red-600 text-white px-4 py-1 border-2 border-outset border-gray-400 active:border-inset hover:bg-red-700">
                    [EXIT SHRINE]
                </Link>
                <span className="text-black text-sm">Best viewed in Netscape Navigator 4.0</span>
                <div className="w-24"></div>
            </div>

            {/* Marquee Top */}
            <div className="bg-[#FFFF00] text-blue-900 border-b-4 border-blue-800 py-1 font-bold font-mono text-xl overflow-hidden whitespace-nowrap">
                <span className="animate-marquee inline-block px-4">
                    WELCOME TO THE BEN RICE UNOFFICIAL FAN PAGE ★ EST. 2025 ★ YANKEES LEGEND ★ 2-RUN HOMER IN PLAYOFF DEBUT ★
                </span>
                <span className="animate-marquee inline-block px-4">
                    WELCOME TO THE BEN RICE UNOFFICIAL FAN PAGE ★ EST. 2025 ★ YANKEES LEGEND ★ 2-RUN HOMER IN PLAYOFF DEBUT ★
                </span>
            </div>

            {/* Main Content */}
            <div className="relative z-10 container mx-auto p-4 md:p-12 text-center max-w-4xl">

                <div className="border-8 border-double border-white bg-[#000080] p-8 shadow-[10px_10px_0px_0px_rgba(255,255,255,0.5)]">
                    <h1 className="text-5xl md:text-8xl font-serif text-[#FFFF00] drop-shadow-[5px_5px_0px_#FF0000] mb-8 animate-pulse">
                        BEN RICE
                    </h1>

                    <div className="mx-auto w-64 h-64 bg-gray-400 border-4 border-inset border-gray-600 flex items-center justify-center mb-8 relative group">
                        {/* Fallback for missing hero image, using text/css */}
                        <div className="text-center p-4">
                            <p className="text-black font-bold">PHOTO CURRENTLY UNAVAILABLE</p>
                            <p className="text-blue-900 text-xs mt-2">(Awaiting Public Domain Clearance)</p>
                        </div>
                        {/* Overlay the baseball just for fun */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-50 group-hover:opacity-100 transition-opacity">
                            <Image src="/shrines/ben-rice/baseball.png" width={100} height={100} alt="Baseball" className="animate-spin-slow" />
                        </div>
                    </div>

                    <div className="bg-white text-black p-6 border-4 border-red-600 text-left font-mono mb-8">
                        <h2 className="text-2xl border-b-2 border-black mb-4 uppercase font-bold text-center">Achievement Log</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>Date:</strong> October 2, 2025</li>
                            <li><strong>Event:</strong> AL Wild Card Series, Game 2</li>
                            <li><strong>Opponent:</strong> Boston Red Sox</li>
                            <li><strong>Feat:</strong> First Yankee rookie in the 21st century to hit a home run in his first postseason at-bat.</li>
                            <li><strong>Stat Line:</strong> 1-for-3, HR, 2 RBI</li>
                            <li><strong>Validation:</strong> ABSOLUTE LEGEND</li>
                        </ul>
                    </div>

                    <div className="text-[#FFFF00] text-xl font-bold animate-bounce">
                        &darr; SIGN THE GUESTBOOK BELOW &darr;
                    </div>

                    <div className="mt-8 bg-gray-200 p-2 text-black text-xs font-mono border border-gray-500 inline-block">
                        <p>Visitor Count: 0029381</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-12 text-xs font-mono text-gray-400">
                    <p>DISCLAIMER: This site is not affiliated with the New York Yankees or Ben Rice.</p>
                    <p>All assets used are Public Domain / Creative Commons.</p>
                    <p>Baseball Clipart: Public Domain (Wikimedia Commons).</p>
                    <p>Design: 100% Human Made (HTML/CSS).</p>
                </div>

            </div>

            {/* Whizzing Objects */}
            {whizzers.map((id) => (
                <WhizzingElement key={id} />
            ))}

        </div>
    );
}

function WhizzingElement() {
    const [style] = useState<React.CSSProperties>(() => {
        const top = Math.random() * 90;
        const duration = Math.random() * 3 + 2; // Slower, more majestic 90s speed
        return {
            top: `${top}%`,
            animationDuration: `${duration}s`,
        };
    });

    const [content] = useState(() => {
        const textOptions = ["HOMERUN!", "YANKEES!", "WOW!!", "RICE!", "GUESTBOOK??"];
        if (Math.random() > 0.6) {
            return {
                type: "text" as const,
                text: textOptions[Math.floor(Math.random() * textOptions.length)],
                color: Math.random() > 0.5 ? "#FFFF00" : "#FF0000",
            };
        }
        return { type: "baseball" as const, text: "", color: "#FFFF00" };
    });

    if (content.type === 'baseball') {
        return (
            <div className="absolute -left-32 w-16 h-16 animate-whiz z-20" style={style}>
                <Image src="/shrines/ben-rice/baseball.png" alt="Baseball" width={64} height={64} className="animate-spin" />
            </div>
        )
    }

    return (
        <div className="absolute -left-64 text-4xl font-black italic text-[#FFFF00] shadow-black drop-shadow-md animate-whiz whitespace-nowrap z-20 font-sans" style={{ ...style, color: content.color }}>
            {content.text}
        </div>
    );
}
