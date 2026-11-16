
import time
import re
from urllib.parse import urljoin
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


def scrape_instagram_follower_list(
    driver,
    instagram_url,
    max_records=1000
):
    """
    Collect visible Instagram follower records using
    an existing authenticated Selenium Chrome session.

    Stops when the configured limit is reached or
    Instagram stops loading additional records.
    """

    followers = {}
    main_window = driver.current_window_handle
    new_window = None

    try:
        driver.switch_to.new_window("tab")
        new_window = driver.current_window_handle

        driver.get(instagram_url)
        time.sleep(5)

        # Click the Followers link
        follower_link = WebDriverWait(driver, 20).until(
            EC.element_to_be_clickable(
                (By.XPATH, "//a[contains(@href, '/followers')]")
            )
        )

        follower_link.click()

        # Wait for followers modal
        dialog = WebDriverWait(driver, 20).until(
            EC.presence_of_element_located(
                (By.XPATH, "//div[@role='dialog']")
            )
        )

        print("[DEBUG] Instagram followers modal opened")

        # Find the modal's scrollable container
        scroll_container = driver.execute_script("""
            const dialog = arguments[0];

            const elements = [
                dialog,
                ...dialog.querySelectorAll('*')
            ];

            return elements
                .filter(el =>
                    el.scrollHeight > el.clientHeight + 20 &&
                    getComputedStyle(el).overflowY !== 'hidden'
                )
                .sort((a, b) =>
                    b.scrollHeight - a.scrollHeight
                )[0] || dialog;
        """, dialog)

        idle_rounds = 0
        previous_count = 0

        while len(followers) < max_records:

            # Extract visible profile links
            links = dialog.find_elements(
                By.XPATH, ".//a[starts-with(@href, '/')]"
            )

            for link in links:
                href = link.get_attribute("href") or ""

                match = re.search(
                    r"instagram\.com/([A-Za-z0-9._]+)/?$",
                    href,
                    re.I
                )

                if not match:
                    continue

                username = match.group(1)

                if username.lower() in {
                    "explore", "accounts", "direct",
                    "reels", "stories", "p"
                }:
                    continue

                if username not in followers:
                    followers[username] = {
                        "username": username,
                        "full_name": "",
                        "profile_url":
                            f"https://www.instagram.com/{username}/"
                    }

                # Attempt to get the visible display name
                try:
                    row_text = driver.execute_script("""
                        let el = arguments[0];

                        for (let i = 0; i < 5 && el; i++) {
                            if (el.innerText &&
                                el.innerText.trim().length > 0) {
                                const text = el.innerText
                                    .split('\\n')
                                    .map(x => x.trim())
                                    .filter(Boolean);

                                if (text.length >= 2) {
                                    return text.slice(0, 2);
                                }
                            }
                            el = el.parentElement;
                        }

                        return [];
                    """, link)

                    if row_text:
                        followers[username]["full_name"] = (
                            row_text[1]
                            if len(row_text) > 1
                            else ""
                        )

                except Exception:
                    pass

                if len(followers) >= max_records:
                    break

            print(
                f"[DEBUG] Instagram followers collected: "
                f"{len(followers)}"
            )

            if len(followers) == previous_count:
                idle_rounds += 1
            else:
                idle_rounds = 0

            if idle_rounds >= 4:
                print("[DEBUG] No additional followers loaded")
                break

            previous_count = len(followers)

            # Scroll only the followers modal
            driver.execute_script("""
                arguments[0].scrollTop =
                    arguments[0].scrollHeight;
            """, scroll_container)

            time.sleep(2.5)

        print(
            f"[SUCCESS] Total followers collected: "
            f"{len(followers)}"
        )

        return list(followers.values())

    except Exception as e:
        print("[ERROR] Instagram follower scraping:", e)
        return list(followers.values())

    finally:
        if new_window:
            try:
                driver.switch_to.window(new_window)
                driver.close()
            except Exception:
                pass

        try:
            driver.switch_to.window(main_window)
        except Exception:
            pass
