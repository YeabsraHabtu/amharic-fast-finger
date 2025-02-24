export const amharicWords = [
    "ሰላም", "እንዴት", "ነህ", "ነሽ", "ኢትዮጵያ", "አዲስ", "አበባ", "ውሃ", "ልጅ", "ትምህርት", 
    "ቤት", "እኔ", "አንተ", "አንቺ", "እኛ", "እናንተ", "እነሱ", "ምን", "ማን", "መቼ", 
    "የት", "ጥሩ", "ቆንጆ", "ትልቅ", "ትንሽ", "ቀይ", "ጥቁር", "ነጭ", "አረንጓዴ", "ቢጫ", 
    "ሰማያዊ", "አንድ", "ሁለት", "ሶስት", "አራት", "አምስት", "ስድስት", "ሰባት", "ስምንት", "ዘጠኝ", 
    "አስር", "መጽሐፍ", "ስራ", "ሰው", "ሴት", "ወንድ", "እናት", "አባት", "እህት", "ወንድም",
    "ጊዜ", "ቀን", "ሌሊት", "ጠዋት", "ማታ", "ዛሬ", "ነገ", "ትናንት", "ሳምንት", "ወር", 
    "ዓመት", "ሀገር", "መንገድ", "መኪና", "ምግብ", "ቡና", "ሻይ", "ወተት", "ስጋ", "ዳቦ"
];

export function getRandomWords(count: number, mode: 'normal' | 'advanced' = 'normal'): string[] {
    const words = [...amharicWords];
    const result = [];
    const punctuation = ["።", "፣", "፧", "!", "?", ".", ","];
    const numbers = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

    for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * words.length);
        let word = words[randomIndex];

        if (mode === 'advanced') {
            const rand = Math.random();
            if (rand < 0.2) {
                // Add punctuation to the end
                word += punctuation[Math.floor(Math.random() * punctuation.length)];
            } else if (rand < 0.3) {
                // Add a number
                word = numbers[Math.floor(Math.random() * numbers.length)] + word;
            }
        }

        result.push(word);
    }
    return result;
}
