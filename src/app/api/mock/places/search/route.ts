
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    if (!query) {
        return NextResponse.json([]);
    }

    const qLower = query.toLowerCase();

    // Mock Database
    const MOCK_PLACES = [
        { name: "Joe's Pizza", address: "123 Main St", rating: 4.5, reviewCount: 120, priceLevel: "$", photo: "🍕" },
        { name: "Sushi Palace", address: "456 Oak Ave", rating: 4.8, reviewCount: 85, priceLevel: "$$$", photo: "🍣" },
        { name: "Burger King", address: "789 Pine Ln", rating: 3.2, reviewCount: 200, priceLevel: "$", photo: "🍔" },
        { name: "The French Laundry", address: "6640 Washington St", rating: 4.9, reviewCount: 3000, priceLevel: "$$$$", photo: "🍷" },
        { name: "Taco Bell", address: "101 1st St", rating: 3.5, reviewCount: 150, priceLevel: "$", photo: "🌮" },
        { name: "Pasta House", address: "202 2nd St", rating: 4.2, reviewCount: 90, priceLevel: "$$", photo: "🍝" },
        { name: "Curry Corner", address: "303 3rd St", rating: 4.6, reviewCount: 110, priceLevel: "$$", photo: "🍛" },
        { name: "Steakhouse Prime", address: "404 4th St", rating: 4.7, reviewCount: 180, priceLevel: "$$$", photo: "🥩" },
        { name: "Vegan Delights", address: "505 5th St", rating: 4.4, reviewCount: 70, priceLevel: "$$", photo: "🥗" },
        { name: "Donut Shop", address: "606 6th St", rating: 4.3, reviewCount: 50, priceLevel: "$", photo: "🍩" },
    ];

    const results = MOCK_PLACES.filter(place => place.name.toLowerCase().includes(qLower));

    return NextResponse.json(results);
}
