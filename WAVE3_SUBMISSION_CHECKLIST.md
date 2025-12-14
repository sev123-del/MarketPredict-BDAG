# Wave 3 Buildathon Submission Checklist
**Date:** December 9, 2025  
**Project:** MarketPredict-BDAG  
**Contract:** 0x03B20cB83f83DA1d924D283A88694C7CBAA804f1

---

## 🔴 CRITICAL - Must Fix Before Submission

### 1. **TIMEZONE CONVERSION BUG** ⚠️
- **Status:** BROKEN (attempted 4+ times)
- **Issue:** Markets not showing correct close times
- **Impact:** Users cannot trust when markets close - CORE FUNCTIONALITY
- **Options:**
  - [ ] Use date library (date-fns or luxon)
  - [ ] Switch to UTC-only (remove timezone selector)
  - [ ] Simplify offset calculation with new approach
- **Priority:** HIGHEST - This must work correctly

### 2. **Test Complete User Flow**
- [ ] Deposit BDAG
- [ ] Create market
- [ ] Place predictions (YES and NO)
- [ ] Wait for market to close
- [ ] Resolve market (48h delay working?)
- [ ] Claim winnings
- [ ] Verify payout calculations are correct

### 3. **Test Refund Mechanisms**
- [ ] Delete a market
- [ ] Verify "Cancelled Market" badge shows
- [ ] Claim refund as user who predicted
- [ ] Verify refund amount is correct
- [ ] Try to claim twice (should fail with "Already claimed")
- [ ] Verify non-participants can't claim

### 4. **Test Security Features**
- [ ] Set personal spending limit
- [ ] Try to exceed limit (should fail)
- [ ] Self-restrict for 1 day
- [ ] Try to predict while restricted (should fail)
- [ ] Test pause functionality (owner only)
- [ ] Test global emergency pause

---

## 🟡 HIGH PRIORITY - Should Complete

### 5. **UI/UX Polish**
- [ ] Verify all deleted market badges show correctly
- [ ] Verify "Market Live" badge only shows when appropriate
- [ ] Check all status badges (Resolved, Expired, Paused, Cancelled)
- [ ] Test wallet page deposit/withdraw
- [ ] Verify error messages are clear and helpful
- [ ] Check success notifications display properly

### 6. **Code Cleanup**
- [ ] Remove console.log statements (production ready)
- [ ] Check for any TODO comments
- [ ] Verify all error handling is in place
- [ ] Remove unused imports/variables

### 7. **Documentation**
- [ ] Update README.md with:
  - [ ] Project description
  - [ ] Features list
  - [ ] Security features
  - [ ] How to use (user guide)
  - [ ] Contract address
  - [ ] Deployment instructions
- [ ] Add inline code comments where complex logic exists
- [ ] Document smart contract functions

---

## 🟢 NICE TO HAVE - If Time Permits

### 8. **Additional Testing**
- [ ] Test with multiple users (different wallets)
- [ ] Test edge cases (0 amounts, very large amounts)
- [ ] Test expired markets
- [ ] Test with MetaMask on different browsers
- [ ] Mobile responsive testing

### 9. **Performance**
- [ ] Check page load times
- [ ] Optimize any slow contract calls
- [ ] Reduce unnecessary re-renders

### 10. **Visual Polish**
- [ ] Consistent spacing/padding
- [ ] Color scheme consistency
- [ ] Animations smooth and not jarring
- [ ] Responsive design on mobile

---

## 📋 SUBMISSION REQUIREMENTS

### Pre-Submission Checklist
- [ ] All critical bugs fixed (especially timezone!)
- [ ] Contract deployed and verified on BDAG Testnet
- [ ] Frontend deployed (Vercel/Netlify) OR instructions to run locally
- [ ] README.md complete with clear instructions
- [ ] Video demo recorded (if required)
- [ ] Submission form filled out
- [ ] All team member info included

### What to Submit
- [ ] GitHub repository URL
- [ ] Live demo URL (if deployed)
- [ ] Contract address: `0x03B20cB83f83DA1d924D283A88694C7CBAA804f1`
- [ ] Video walkthrough (if required)
- [ ] Written description of project
- [ ] List of technologies used
- [ ] Team members

---

## 🎯 PROJECT HIGHLIGHTS TO EMPHASIZE

### Unique Features
1. **Comprehensive Security Implementation**
   - 48-hour resolution delay for disputes
   - User spending limits (platform max: 500k BDAG)
   - Self-restriction functionality (1 day to 1 year)
   - Global emergency pause
   - Full refund system for cancelled markets

2. **Responsible Prediction Platform**
   - Not marketed as gambling or trading
   - User protection features built-in
   - Clear language and terminology
   - Settings page for self-control

3. **AMM-Style Pricing**
   - Dynamic odds based on pool ratios
   - Proportional share system
   - Fair payout calculations
   - Initial liquidity to prevent division by zero

4. **User Experience**
   - Multi-timezone support (24 zones)
   - Real-time pool updates
   - Potential winnings calculator
   - Clear status indicators
   - Intuitive prediction interface

---

## 🐛 KNOWN ISSUES (Document These)

1. **Timezone Conversion** - In progress, multiple approaches attempted
2. **getUserTotalInMarket** - May fail on some contract calls (handled gracefully)
3. **Contract Redeployment** - Wipes all markets (expected for testnet)

---

## ⏰ TIME ESTIMATE

**Remaining Work:**
- Fix timezone: 2-3 hours
- Full testing cycle: 2-3 hours
- Documentation: 1-2 hours
- Polish & cleanup: 1 hour
- Submission prep: 1 hour

**Total:** 7-10 hours

---

## 📝 NOTES

- Contract has been redeployed 3 times due to security updates
- All gambling/betting/trading language removed per user requirements
- Delete functionality fully implemented with proper state tracking
- Wallet UX improved with larger, outlined inputs
- Settings page created for user controls

---

**NEXT STEPS:**
1. Fix timezone conversion (CRITICAL)
2. Run complete test cycle
3. Document everything
4. Submit!
